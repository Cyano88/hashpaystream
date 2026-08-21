import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { readDurableJson } from './durable-store.js'
import type { UpfrontAssessmentStore } from './upfront-assessment.js'

const DEFAULT_STORE_KEY = 'hashpaystream:upfront-assessments:v1'

type Dependencies = {
  identityEmails: (req: Request, env: NodeJS.ProcessEnv) => Promise<string[]>
  readStore: (key: string) => Promise<UpfrontAssessmentStore | undefined>
  env: () => NodeJS.ProcessEnv
  now: () => Date
}

function clean(value: unknown, maximum: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function failure(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

function bearer(req: Pick<Request, 'headers'>) {
  return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

function funderEmails(env: NodeJS.ProcessEnv) {
  return new Set([
    ...String(env.HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS ?? '').split(','),
    ...String(env.HASHPAYSTREAM_UPFRONT_FUNDER_WALLETS ?? '').split(','),
  ]
    .map(value => value.trim().toLowerCase())
    .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^0x[a-f0-9]{40}$/.test(value)))
}

async function verifiedIdentityEmails(req: Request, env: NodeJS.ProcessEnv) {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) failure('HashPayStream authentication is unavailable.', 503)
  if (!token) failure('Sign in with an approved funder account.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    if (!userId) throw new Error('Privy identity is empty.')
    const user = await privy.users()._get(userId)
    return user.linked_accounts.flatMap(account => {
      if (account.type !== 'email' && account.type !== 'wallet') return []
      const address = String(account.address ?? '').trim().toLowerCase()
      return address ? [address] : []
    })
  } catch (cause) {
    throw Object.assign(failure('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function opportunity(record: UpfrontAssessmentStore['records'][string], now: Date) {
  if (record.status !== 'completed' || !record.agreementId || record.request?.agreement.state !== 'funded') return undefined
  const response = record.response && typeof record.response === 'object' ? record.response : {}
  const intelligence = response.intelligence && typeof response.intelligence === 'object' ? response.intelligence as Record<string, unknown> : {}
  const decision = response.decision && typeof response.decision === 'object' ? response.decision as Record<string, unknown> : {}
  const offer = decision.onchainOffer && typeof decision.onchainOffer === 'object' ? decision.onchainOffer as Record<string, unknown> : undefined
  const expiresAt = clean(decision.expiresAt, 64)
  if (decision.decision !== 'APPROVE' || !offer || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now.getTime()) return undefined
  const protectedUnits = clean(record.request.agreement.amountUsdcUnits, 32)
  const requestedUnits = clean(record.request.advance.requestedUsdcUnits, 32)
  const maximumAdvanceBps = Number(decision.maximumAdvanceBps)
  if (!/^\d+$/.test(protectedUnits) || !/^\d+$/.test(requestedUnits) || !Number.isInteger(maximumAdvanceBps) || maximumAdvanceBps < 1 || maximumAdvanceBps > 10_000) return undefined
  const policyMaximum = BigInt(protectedUnits) * BigInt(maximumAdvanceBps) / 10_000n
  const fundableUnits = BigInt(requestedUnits) < policyMaximum ? BigInt(requestedUnits) : policyMaximum
  if (fundableUnits <= 0n) return undefined
  return {
    id: record.request.requestId,
    agreementId: record.agreementId,
    title: record.request.agreement.title,
    protectedUsdcUnits: protectedUnits,
    requestedAdvanceUsdcUnits: fundableUnits.toString(),
    maximumAdvanceBps,
    durationSeconds: record.request.agreement.durationSeconds,
    providerPayoutAddress: record.request.advance.providerPayoutAddress,
    evidenceGrade: clean(intelligence.evidenceGrade, 24),
    confidence: Number(intelligence.confidence),
    expiresAt,
    onchainOffer: offer,
  }
}

const defaults: Dependencies = {
  identityEmails: verifiedIdentityEmails,
  readStore: key => readDurableJson<UpfrontAssessmentStore>(key),
  env: () => process.env,
  now: () => new Date(),
}

export function createUpfrontOpportunitiesHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function upfrontOpportunities(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      const env = dependencies.env()
      if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') failure('HashPayStream Upfront is not enabled.', 404)
      const allowed = funderEmails(env)
      if (!allowed.size) failure('The private Upfront funding desk is not configured.', 503)
      const emails = await dependencies.identityEmails(req, env)
      if (!emails.some(email => allowed.has(email))) failure('This account is not approved to fund Upfront opportunities.', 403)
      const storeKey = clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
      if (!storeKey) failure('The Upfront opportunity store is unavailable.', 503)
      const store = await dependencies.readStore(storeKey)
      const opportunities = Object.values(store?.records ?? {})
        .flatMap(record => opportunity(record, dependencies.now()) ?? [])
        .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
      return res.json({ ok: true, opportunities })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'The private Upfront funding desk is temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createUpfrontOpportunitiesHandler()
