import { createHmac } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { getAddress, isAddress } from 'viem'
import { mutateDurableJson, readDurableJson } from './durable-store.js'
import { requestPolyDeskUnderwriting } from './polydesk-upfront-client.js'
import type { UpfrontAssessmentRecord, UpfrontAssessmentStore } from './upfront-assessment.js'
import { requireUpfrontSettlementV3 } from './upfront-v3.js'

const DEFAULT_STORE_KEY = 'hashpaystream:upfront-assessments:v1'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REQUEST_ID = /^uai_[a-zA-Z0-9]{12,80}$/

type Identity = { userId: string; emails: string[] }
type Dependencies = {
  identity: (req: Request, env: NodeJS.ProcessEnv) => Promise<Identity>
  read: (key: string) => Promise<UpfrontAssessmentStore | undefined>
  mutate: (key: string, update: (current: UpfrontAssessmentStore | undefined) => UpfrontAssessmentStore) => Promise<UpfrontAssessmentStore>
  underwrite: typeof requestPolyDeskUnderwriting
  env: () => NodeJS.ProcessEnv
  now: () => Date
}

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function bearer(req: Pick<Request, 'headers'>) { return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '' }
function emailSet(value: unknown) { return new Set(String(value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(item => EMAIL.test(item))) }
function safeStore(value?: UpfrontAssessmentStore): UpfrontAssessmentStore { return { schema: 1, records: value?.schema === 1 && value.records ? { ...value.records } : {} } }
function providerReference(secret: string, userId: string) { return 'hps_provider_' + createHmac('sha256', secret).update('upfront\0' + userId).digest('hex').slice(0, 32) }
function operatorReference(secret: string, userId: string) { return 'hps_operator_' + createHmac('sha256', secret).update('operator\0' + userId).digest('hex').slice(0, 32) }

async function verifiedIdentity(req: Request, env: NodeJS.ProcessEnv): Promise<Identity> {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) fail('HashPayStream authentication is unavailable.', 503)
  if (!token) fail('Sign in to continue.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    const user = await privy.users()._get(userId)
    const emails = [...new Set(user.linked_accounts.flatMap(account => account.type === 'email' ? [clean(account.address, 254).toLowerCase()] : []).filter(email => EMAIL.test(email)))]
    if (!userId || !emails.length) throw new Error('Verified identity is incomplete.')
    return { userId, emails }
  } catch (cause) {
    throw Object.assign(fail('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function configuration(env: NodeJS.ProcessEnv) {
  requireUpfrontSettlementV3(env)
  const secret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const storeKey = clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
  if (secret.length < 32 || !storeKey) fail('Upfront review is temporarily unavailable.', 503)
  return { secret, storeKey }
}

function polyDeskConfiguration(env: NodeJS.ProcessEnv) {
  const baseUrl = clean(env.HASHPAYSTREAM_POLYDESK_BASE_URL, 240)
  const serviceToken = clean(env.HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN, 300)
  const signingSecret = clean(env.HASHPAYSTREAM_POLYDESK_SIGNING_SECRET, 300)
  const expectedKeyId = clean(env.HASHPAYSTREAM_POLYDESK_SIGNING_KEY_ID, 80)
  const expectedSigner = clean(env.HASHPAYSTREAM_POLYDESK_EIP712_SIGNER, 42)
  const escrowContract = clean(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const chainId = Number(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? 1952)
  let parsed: URL
  try { parsed = new URL(baseUrl) } catch { fail('PolyDesk review signing is unavailable.', 503) }
  if (
    parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || serviceToken.length < 32 || signingSecret.length < 32
    || !isAddress(expectedSigner) || !isAddress(escrowContract)
    || !Number.isInteger(chainId) || chainId < 1
  ) fail('PolyDesk review signing is unavailable.', 503)
  return {
    baseUrl: parsed.origin, serviceToken, signingSecret, expectedKeyId: expectedKeyId || undefined,
    expectedSigner: getAddress(expectedSigner), escrowContract: getAddress(escrowContract), chainId,
  }
}

function parts(record: UpfrontAssessmentRecord) {
  const response = record.response && typeof record.response === 'object' && !Array.isArray(record.response) ? record.response : {}
  const intelligence = response.intelligence && typeof response.intelligence === 'object' && !Array.isArray(response.intelligence) ? response.intelligence as Record<string, unknown> : {}
  const decision = response.decision && typeof response.decision === 'object' && !Array.isArray(response.decision) ? response.decision as Record<string, unknown> : {}
  return { response, intelligence, decision }
}

function publicReview(record: UpfrontAssessmentRecord) {
  const { intelligence, decision } = parts(record)
  const request = record.request
  if (!request) fail('The assessment request is unavailable.', 409)
  const offer = decision.onchainOffer && typeof decision.onchainOffer === 'object' && !Array.isArray(decision.onchainOffer) ? decision.onchainOffer as Record<string, unknown> : undefined
  const offerMessage = offer?.message && typeof offer.message === 'object' && !Array.isArray(offer.message) ? offer.message as Record<string, unknown> : undefined
  const protectedAmount = clean(offerMessage?.protectedAmount, 32)
  const underwritingDeadline = Number(offerMessage?.underwritingDeadline)
  return {
    requestId: request.requestId,
    title: request.agreement.title,
    description: request.agreement.deliveryDescription,
    requestedAdvanceBps: request.advance.requestedBps,
    maximumAdvanceBps: Number(decision.maximumAdvanceBps) || 0,
    evidenceGrade: clean(intelligence.evidenceGrade, 24),
    confidence: Number(intelligence.confidence) || 0,
    deliveryClarityScore: Number(intelligence.deliveryClarityScore) || 0,
    reasonCodes: [...new Set([
      ...(Array.isArray(intelligence.reasonCodes) ? intelligence.reasonCodes : []),
      ...(Array.isArray(decision.reasonCodes) ? decision.reasonCodes : []),
    ].map(item => clean(item, 80)).filter(Boolean))],
    summary: clean(intelligence.summary, 500),
    decision: clean(decision.decision, 20),
    ...(protectedAmount && Number.isSafeInteger(underwritingDeadline) ? { onchainOffer: { message: { protectedAmount, underwritingDeadline } } } : {}),
    review: record.review,
  }
}

function findRecord(store: UpfrontAssessmentStore, requestId: string) {
  return Object.entries(store.records).find(([, record]) => record.request?.requestId === requestId)
}

const defaults: Dependencies = {
  identity: verifiedIdentity,
  read: key => readDurableJson<UpfrontAssessmentStore>(key),
  mutate: (key, update) => mutateDurableJson<UpfrontAssessmentStore>(key, update),
  underwrite: requestPolyDeskUnderwriting,
  env: () => process.env,
  now: () => new Date(),
}

export function createUpfrontReviewsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function upfrontReviews(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
      const env = dependencies.env()
      const config = configuration(env)
      const identity = await dependencies.identity(req, env)
      const admins = emailSet(env.HASHPAYSTREAM_ADMIN_EMAILS)
      const operator = identity.emails.some(email => admins.has(email))
      const store = safeStore(await dependencies.read(config.storeKey))

      if (req.method === 'GET' && clean(req.query?.review, 8) === '1') {
        if (!operator) fail('Operator access is required.', 403)
        const reviews = Object.values(store.records)
          .filter(record => record.status === 'completed' && record.review)
          .map(publicReview)
          .sort((left, right) => String(right.review?.submittedAt).localeCompare(String(left.review?.submittedAt)))
        return res.json({ ok: true, reviews })
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const requestId = clean(req.method === 'GET' ? req.query?.requestId : body.requestId, 100)
      if (!REQUEST_ID.test(requestId)) fail('Upfront review request is invalid.', 400)
      const found = findRecord(store, requestId)
      if (!found) fail('Upfront assessment was not found.', 404)
      const [recordKey, record] = found

      if (req.method === 'GET') {
        if (record.ownerReference !== providerReference(config.secret, identity.userId)) fail('Upfront assessment was not found.', 404)
        return res.json({ ok: true, assessment: publicReview(record) })
      }

      const action = clean(body.action, 24)
      if (action === 'submit') {
        if (record.ownerReference !== providerReference(config.secret, identity.userId)) fail('Upfront assessment was not found.', 404)
        if (parts(record).decision.decision !== 'ESCALATE') fail('Only an escalated assessment can be submitted for review.', 409)
        const now = dependencies.now().toISOString()
        let updated!: UpfrontAssessmentRecord
        await dependencies.mutate(config.storeKey, current => {
          const next = safeStore(current)
          const existing = next.records[recordKey]
          if (!existing || existing.ownerReference !== record.ownerReference) fail('Upfront assessment changed before review.', 409)
          updated = { ...existing, review: existing.review?.status === 'approved' ? existing.review : { status: 'pending', submittedAt: existing.review?.submittedAt ?? now } }
          next.records[recordKey] = updated
          return next
        })
        return res.status(record.review ? 200 : 201).json({ ok: true, assessment: publicReview(updated) })
      }

      if (!operator) fail('Operator access is required.', 403)
      if (!['approve', 'decline'].includes(action)) fail('Review decision is invalid.', 400)
      if (!record.review || record.review.status !== 'pending') fail('This assessment is not awaiting review.', 409)
      const reviewedAt = dependencies.now().toISOString()
      const reviewerReference = operatorReference(config.secret, identity.userId)

      if (action === 'decline') {
        let declined!: UpfrontAssessmentRecord
        await dependencies.mutate(config.storeKey, current => {
          const next = safeStore(current)
          const existing = next.records[recordKey]
          if (!existing?.review || existing.review.status !== 'pending') fail('This assessment is not awaiting review.', 409)
          declined = { ...existing, review: { ...existing.review, status: 'declined', reviewedAt, reviewerReference } }
          next.records[recordKey] = declined
          return next
        })
        return res.json({ ok: true, assessment: publicReview(declined) })
      }

      if (!record.request) fail('The assessment request is unavailable.', 409)
      const { intelligence } = parts(record)
      const signed = await dependencies.underwrite({
        request: record.request,
        intelligence: intelligence as Parameters<typeof requestPolyDeskUnderwriting>[0]['intelligence'],
        ...polyDeskConfiguration(env),
        now: dependencies.now(),
        manualReview: { decision: 'approve', reviewerReference, reviewedAt, reason: 'DELIVERY_TERMS_REVIEWED' },
      })
      if (signed.decision !== 'APPROVE' || !signed.onchainOffer) fail('PolyDesk did not issue an approved signed offer.', 409)
      let approved!: UpfrontAssessmentRecord
      await dependencies.mutate(config.storeKey, current => {
        const next = safeStore(current)
        const existing = next.records[recordKey]
        if (!existing?.review || existing.review.status !== 'pending') fail('This assessment is not awaiting review.', 409)
        approved = {
          ...existing,
          response: { ...(existing.response ?? {}), decision: signed },
          review: { ...existing.review, status: 'approved', reviewedAt, reviewerReference },
        }
        next.records[recordKey] = approved
        return next
      })
      return res.json({ ok: true, assessment: publicReview(approved) })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Upfront review is temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createUpfrontReviewsHandler()
