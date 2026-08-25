import { createHmac } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './durable-store.js'

const DEFAULT_HUMAN_STORE_KEY = 'hashpaystream:human-agreement-owners:v1'
const DEFAULT_UPFRONT_STORE_KEY = 'hashpaystream:upfront-agreement-owners:v1'
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
type RecordItem = { agreementId: string; ownerHash: string; payerHash?: string; payerReviewPath?: string; source?: 'human' | 'upfront'; declinedAt?: string; createdAt: string; updatedAt: string }
type Store = { schema: 1; agreements: Record<string, RecordItem>; idempotency: Record<string, string> }
type Dependencies = {
  env: () => NodeJS.ProcessEnv
  identity: typeof identity
  hasStore: () => boolean
  read: (key: string) => Promise<Store | undefined>
  mutate: (key: string, update: (current: Store | undefined) => Store | Promise<Store>) => Promise<Store>
  fetcher: typeof fetch
  now: () => Date
}

function clean(value: unknown, max: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function bearer(req: Pick<Request, 'headers'>) { return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '' }
function hash(secret: string, email: string) { return createHmac('sha256', secret).update(`hashpaystream.payer\0${email.toLowerCase()}`).digest('hex') }

async function identity(req: Request, env: NodeJS.ProcessEnv) {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const secret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !secret) fail('HashPayStream authentication is unavailable.', 503)
  if (!token) fail('Sign in to view requests.', 401)
  try {
    const client = new PrivyClient({ appId, appSecret: secret })
    const claims = await client.utils().auth().verifyAccessToken(token)
    const user = await client.users()._get(clean(claims.user_id, 180))
    const email = user.linked_accounts.flatMap(account => account.type === 'email' ? [clean(account.address, 254).toLowerCase()] : []).find(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    if (!email) throw new Error('Verified email is unavailable.')
    return email
  } catch { fail('Your HashPayStream session is invalid or expired.', 401) }
}

function configuration(env: NodeJS.ProcessEnv) {
  const ownershipSecret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const humanStoreKey = clean(env.HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY ?? DEFAULT_HUMAN_STORE_KEY, 160)
  const upfrontStoreKey = clean(env.HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY ?? DEFAULT_UPFRONT_STORE_KEY, 160)
  const directKey = clean(env.HASHPAYSTREAM_ARC_API_KEY, 240)
  const upfrontKey = clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 240)
  const rawBase = clean(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 300)
  let origin = ''
  try { const url = new URL(rawBase); if (url.protocol === 'https:' && !url.username && !url.password) origin = url.origin } catch { /* handled below */ }
  if (ownershipSecret.length < 32 || !humanStoreKey || !upfrontStoreKey || humanStoreKey === upfrontStoreKey || !origin) fail('Customer requests are temporarily unavailable.', 503)
  return { ownershipSecret, humanStoreKey, upfrontStoreKey, directKey, upfrontKey, origin }
}

async function upstream(config: ReturnType<typeof configuration>, source: 'direct' | 'upfront', ids: string[], fetcher: typeof fetch) {
  if (!ids.length) return [] as Record<string, unknown>[]
  const key = source === 'upfront' ? config.upfrontKey : config.directKey
  if (!key.startsWith('hpl_test_') || key.length < 32) return []
  const response = await fetcher(`${config.origin}/api/v2/agreements?ids=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store', headers: { 'x-api-key': key, accept: 'application/json' } })
  const body = await response.json().catch(() => ({})) as { ok?: boolean; agreements?: Record<string, unknown>[]; error?: string }
  if (!response.ok || body.ok !== true || !Array.isArray(body.agreements)) fail('Customer requests could not be refreshed.', 503)
  return body.agreements
}

async function revokePayerLink(config: ReturnType<typeof configuration>, source: 'direct' | 'upfront', agreementId: string, fetcher: typeof fetch) {
  const key = source === 'upfront' ? config.upfrontKey : config.directKey
  if (!key.startsWith('hpl_test_') || key.length < 32) fail('Customer requests are temporarily unavailable.', 503)
  const response = await fetcher(`${config.origin}/api/v2/agreements`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'x-api-key': key, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'rotate_payer_link', agreementId }),
  })
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string }
  if (!response.ok || body.ok !== true) {
    const status = response.status >= 400 && response.status < 500 ? response.status : 503
    fail(clean(body.error, 220) || 'The payer link could not be revoked.', status)
  }
}

const defaults: Dependencies = {
  env: () => process.env,
  identity,
  hasStore: hasRenderDurableStore,
  read: key => readDurableJson<Store>(key),
  mutate: (key, update) => mutateDurableJson<Store>(key, update),
  fetcher: fetch,
  now: () => new Date(),
}

export function createCustomerRequestsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function customerRequests(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      if (!dependencies.hasStore()) fail('Customer requests are temporarily unavailable.', 503)
      const env = dependencies.env()
      const config = configuration(env)
      const email = await dependencies.identity(req, env)
      const payerHash = hash(config.ownershipSecret, email)
      const [humanStore, upfrontStore] = await Promise.all([dependencies.read(config.humanStoreKey), dependencies.read(config.upfrontStoreKey)])
      const humanOwned = Object.values(humanStore?.agreements ?? {}).filter(item => item.payerHash === payerHash && AGREEMENT_ID.test(item.agreementId)).slice(0, 100)
      const upfrontOwned = Object.values(upfrontStore?.agreements ?? {}).filter(item => item.payerHash === payerHash && AGREEMENT_ID.test(item.agreementId)).slice(0, 100)
      const owned = [...humanOwned.map(item => ({ ...item, source: 'human' as const })), ...upfrontOwned.map(item => ({ ...item, source: 'upfront' as const }))]
      const direct = await upstream(config, 'direct', humanOwned.map(item => item.agreementId), dependencies.fetcher)
      const upfront = await upstream(config, 'upfront', upfrontOwned.map(item => item.agreementId), dependencies.fetcher)
      const byId = new Map([...direct, ...upfront].map(item => [clean(item.id, 80), item]))
      if (req.method === 'POST') {
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
        const agreementId = clean(body.agreementId, 80)
        const record = owned.find(item => item.agreementId === agreementId)
        const agreement = byId.get(agreementId)
        if (clean(body.action, 20) !== 'decline' || !record || !agreement) fail('Request action is invalid.', 400)
        if (clean(agreement.status, 40) !== 'awaiting_start') fail('Only an unfunded request can be declined.', 409)
        if (record.declinedAt) return res.json({ ok: true, agreementId, decision: 'declined', declinedAt: record.declinedAt })
        await revokePayerLink(config, record.source === 'upfront' ? 'upfront' : 'direct', agreementId, dependencies.fetcher)
        const declinedAt = dependencies.now().toISOString()
        const storeKey = record.source === 'upfront' ? config.upfrontStoreKey : config.humanStoreKey
        await dependencies.mutate(storeKey, current => {
          const next: Store = current?.schema === 1 ? { schema: 1, agreements: { ...current.agreements }, idempotency: { ...current.idempotency } } : { schema: 1, agreements: {}, idempotency: {} }
          const existing = next.agreements[agreementId]
          if (!existing || existing.payerHash !== payerHash) fail('Request was not found.', 404)
          next.agreements[agreementId] = { ...existing, declinedAt, updatedAt: declinedAt }
          return next
        })
        return res.json({ ok: true, agreementId, decision: 'declined', declinedAt })
      }
      const requests = owned.flatMap(record => {
        const agreement = byId.get(record.agreementId)
        if (!agreement) return []
        const status = clean(agreement.status, 40)
        const decision = record.declinedAt ? 'declined' : status === 'awaiting_start' ? 'to_review' : 'accepted'
        return [{ id: record.agreementId, title: clean(agreement.title, 180) || 'Job request', description: clean(agreement.description, 800), amountUsdcUnits: clean((agreement.chain as Record<string, unknown> | undefined)?.amountUsdcUnits ?? agreement.amount, 80), status, decision, createdAt: record.createdAt, updatedAt: record.updatedAt, payerReviewPath: record.payerReviewPath ?? '', earlyPay: record.source === 'upfront' }]
      }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      return res.json({ ok: true, requests })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Customer requests are temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createCustomerRequestsHandler()
