import { createHash, createHmac, randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { getAddress, isAddress } from 'viem'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './durable-store.js'

const DEFAULT_REQUEST_STORE_KEY = 'hashpaystream:service-requests:v1'
const DEFAULT_ACCOUNT_STORE_KEY = 'hashpaystream:accounts:v1'
const DEFAULT_HUMAN_STORE_KEY = 'hashpaystream:human-agreement-owners:v1'
const DEFAULT_UPFRONT_STORE_KEY = 'hashpaystream:upfront-agreement-owners:v1'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Role = 'customer' | 'provider'
type RequestStatus = 'sent' | 'countered' | 'provider_accepted' | 'awaiting_funding' | 'funded' | 'expired' | 'refunded' | 'declined' | 'cancelled'
type Terms = {
  version: number; title: string; description: string; amount: string; amountUsdcUnits: string
  durationSeconds: number; cancellationWindowSeconds: number; upfrontRequested: boolean; upfrontReason?: string
  proposedBy: Role; createdAt: string
}
type Event = { id: string; type: string; actor: Role; createdAt: string; version: number }
type ServiceRequest = {
  id: string; customerAccountKey: string; providerAccountKey: string; providerLabel: string
  status: RequestStatus; activeVersion: number; terms: Terms[]; events: Event[]
  providerAcceptedVersion?: number; customerAcceptedVersion?: number
  agreementId?: string; payerReviewPath?: string; createdAt: string; updatedAt: string
}
type RequestStore = { schema: 1; requests: Record<string, ServiceRequest>; idempotency: Record<string, string> }
type Account = { accountKey: string; email: string; displayName: string; pocketId: string; walletAddress?: string }
type AccountStore = { schema: 1; accounts: Record<string, Account> }
type AgreementEventStore = { schema: 1; events: Record<string, { event: string; agreementId: string; createdAt: string }> }
type OwnershipStore = { schema: 1; agreements: Record<string, Record<string, unknown>>; idempotency: Record<string, string> }
type Identity = { userId: string; email: string }

type Dependencies = {
  hasStore: () => boolean
  readRequests: (key: string) => Promise<RequestStore | undefined>
  mutateRequests: (key: string, update: (value: RequestStore | undefined) => RequestStore | Promise<RequestStore>) => Promise<RequestStore>
  readAccounts: (key: string) => Promise<AccountStore | undefined>
  readEvents: (key: string) => Promise<AgreementEventStore | undefined>
  mutateOwnership: (key: string, update: (value: OwnershipStore | undefined) => OwnershipStore | Promise<OwnershipStore>) => Promise<OwnershipStore>
  identity: (req: Request, env: NodeJS.ProcessEnv) => Promise<Identity>
  upstream: (baseUrl: string, apiKey: string, body: Record<string, unknown>, idempotencyKey: string) => Promise<{ status: number; body: Record<string, unknown> }>
  registerRecipient: (baseUrl: string, apiKey: string, secret: string, recipient: string, accountReference: string, now: Date) => Promise<{ status: number; body: Record<string, unknown> }>
  payerUpstream: (baseUrl: string, apiKey: string, capability: string, body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>
  env: () => NodeJS.ProcessEnv; now: () => Date; id: () => string
}

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function bearer(req: Pick<Request, 'headers'>) { return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '' }
function accountKey(secret: string, email: string) { return createHmac('sha256', secret).update(`hashpaystream.account\0${email}`).digest('hex') }
function ownerHash(secret: string, userId: string) { return createHmac('sha256', secret).update(`hashpaystream.owner\0${userId}`).digest('hex') }
function payerHash(secret: string, email: string) { return createHmac('sha256', secret).update(`hashpaystream.payer\0${email}`).digest('hex') }
function units(amount: string) { const [whole, fraction = ''] = amount.split('.'); return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString() }
function validAmount(value: string) { return /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value) && BigInt(units(value)) > 0n }
function maskEmail(email: string) { const [name, domain] = email.split('@'); return `${name.slice(0, 2)}${name.length > 2 ? '***' : '*'}@${domain}` }

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
    const email = user.linked_accounts.flatMap(item => item.type === 'email' ? [clean(item.address, 254).toLowerCase()] : []).find(item => EMAIL.test(item))
    if (!userId || !email) throw new Error('Verified email is unavailable.')
    return { userId, email }
  } catch (cause) {
    throw Object.assign(fail('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

async function upstream(baseUrl: string, apiKey: string, body: Record<string, unknown>, idempotencyKey: string) {
  const response = await fetch(`${baseUrl}/api/v2/agreements`, { method: 'POST', cache: 'no-store', headers: { 'x-api-key': apiKey, 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> }
}

async function registerRecipient(baseUrl: string, apiKey: string, secret: string, recipient: string, accountReference: string, now: Date) {
  const timestamp = Math.floor(now.getTime() / 1000).toString()
  const payload = 'v1\n' + createHash('sha256').update(apiKey).digest('hex') + '\n' + timestamp + '\n' + getAddress(recipient).toLowerCase() + '\n' + accountReference
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  const response = await fetch(baseUrl + '/api/v2/agreements/verified-recipient', {
    method: 'POST', cache: 'no-store',
    headers: { 'x-api-key': apiKey, 'x-recipient-timestamp': timestamp, 'x-recipient-signature': signature, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ recipient: getAddress(recipient), accountReference }),
    signal: AbortSignal.timeout(20_000),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> }
}

async function payerUpstream(baseUrl: string, apiKey: string, capability: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/v2/agreements/project-payer`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'x-api-key': apiKey, 'x-arc-agreement-access': capability, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> }
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore, readRequests: readDurableJson,
  mutateRequests: (key, update) => mutateDurableJson<RequestStore>(key, update), readAccounts: readDurableJson,
  readEvents: readDurableJson,
  mutateOwnership: (key, update) => mutateDurableJson<OwnershipStore>(key, update), identity: verifiedIdentity,
  upstream, registerRecipient, payerUpstream, env: () => process.env, now: () => new Date(), id: () => `req_${randomUUID().replace(/-/g, '')}`,
}

function safeStore(value?: RequestStore): RequestStore { return value?.schema === 1 && value.requests ? { schema: 1, requests: { ...value.requests }, idempotency: { ...(value.idempotency ?? {}) } } : { schema: 1, requests: {}, idempotency: {} } }
function safeOwnership(value?: OwnershipStore): OwnershipStore { return value?.schema === 1 && value.agreements ? { schema: 1, agreements: { ...value.agreements }, idempotency: { ...(value.idempotency ?? {}) } } : { schema: 1, agreements: {}, idempotency: {} } }
function config(env: NodeJS.ProcessEnv) {
  const secret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const base = clean(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 240).replace(/\/$/, '')
  if (secret.length < 32 || !base.startsWith('https://')) fail('HashPayStream requests are temporarily unavailable.', 503)
  return { secret, base, requestStore: clean(env.HASHPAYSTREAM_SERVICE_REQUEST_STORE_KEY ?? DEFAULT_REQUEST_STORE_KEY, 160), accountStore: clean(env.HASHPAYSTREAM_ACCOUNT_STORE_KEY ?? DEFAULT_ACCOUNT_STORE_KEY, 160), humanStore: clean(env.HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY ?? DEFAULT_HUMAN_STORE_KEY, 160), upfrontStore: clean(env.HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY ?? DEFAULT_UPFRONT_STORE_KEY, 160), humanEvents: clean(env.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY ?? 'hashpaystream:arc-webhooks:v1', 160), upfrontEvents: clean(env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY ?? 'hashpaystream:upfront-arc-webhooks:v1', 160) }
}
function publicRequest(item: ServiceRequest, viewer: string) {
  const role: Role = item.customerAccountKey === viewer ? 'customer' : 'provider'
  return { id: item.id, role, direction: role === 'customer' ? 'sent' : 'received', counterparty: role === 'customer' ? item.providerLabel : 'Customer', status: item.status, activeVersion: item.activeVersion, terms: item.terms, events: item.events, agreementId: item.agreementId ?? '', payerReviewPath: role === 'customer' ? item.payerReviewPath ?? '' : '', createdAt: item.createdAt, updatedAt: item.updatedAt }
}
function parseTerms(body: Record<string, unknown>, proposedBy: Role, version: number, now: string, prior?: Terms): Terms {
  const title = clean(body.title ?? prior?.title, 140)
  const description = clean(body.description ?? prior?.description, 1200)
  const amount = clean(body.amount ?? prior?.amount, 40)
  const durationSeconds = Number(body.durationSeconds ?? prior?.durationSeconds ?? 86400)
  const cancellationWindowSeconds = Number(body.cancellationWindowSeconds ?? prior?.cancellationWindowSeconds ?? 900)
  const upfrontRequested = body.upfrontRequested === undefined ? Boolean(prior?.upfrontRequested) : body.upfrontRequested === true
  const upfrontReason = clean(body.upfrontReason ?? prior?.upfrontReason, 300)
  if (title.length < 3 || description.length < 10 || !validAmount(amount)) fail('Enter a valid title, work description, and USDC amount.', 400)
  if (!Number.isInteger(durationSeconds) || durationSeconds < 3600 || durationSeconds > 31_536_000) fail('Delivery period is invalid.', 400)
  if (!Number.isInteger(cancellationWindowSeconds) || cancellationWindowSeconds < 0 || cancellationWindowSeconds >= durationSeconds) fail('Cancellation period must be shorter than delivery period.', 400)
  if (upfrontRequested && upfrontReason.length < 10) fail('Explain why early payment is needed.', 400)
  if (upfrontRequested && durationSeconds < 86_400) fail('Early pay requires a delivery period of at least 1 day.', 400)
  return { version, title, description, amount, amountUsdcUnits: units(amount), durationSeconds, cancellationWindowSeconds, upfrontRequested, ...(upfrontRequested ? { upfrontReason } : {}), proposedBy, createdAt: now }
}

export function createServiceRequestsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (!dependencies.hasStore()) fail('HashPayStream request storage is unavailable.', 503)
      const env = dependencies.env(); const cfg = config(env); const identity = await dependencies.identity(req, env)
      const viewer = accountKey(cfg.secret, identity.email)
      if (req.method === 'GET') {
        const [stored, humanEvents, upfrontEvents] = await Promise.all([dependencies.readRequests(cfg.requestStore), dependencies.readEvents(cfg.humanEvents), dependencies.readEvents(cfg.upfrontEvents)])
        const lifecycle = new Map<string, { status: 'funded' | 'expired' | 'refunded'; createdAt: string }>()
        for (const event of Object.values({ ...(humanEvents?.events ?? {}), ...(upfrontEvents?.events ?? {}) }).sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
          const status = event.event === 'agreement.expired' ? 'expired' : event.event === 'agreement.refunded' ? 'refunded' : ['agreement.activated', 'agreement.step_released'].includes(event.event) ? 'funded' : null
          if (status) lifecycle.set(event.agreementId, { status, createdAt: event.createdAt })
        }
        const requests = Object.values(stored?.requests ?? {}).filter(item => item.customerAccountKey === viewer || item.providerAccountKey === viewer).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100).map(item => {
          const observed = item.agreementId ? lifecycle.get(item.agreementId) : undefined
          if (!observed || !['awaiting_funding', 'funded', 'expired'].includes(item.status)) return publicRequest(item, viewer)
          const events = observed.status === 'funded' && !item.events.some(event => event.type === 'request.funded') ? [...item.events, { id: `${item.id}:funded`, type: 'request.funded', actor: 'customer' as const, createdAt: observed.createdAt, version: item.activeVersion }] : item.events
          return publicRequest({ ...item, status: observed.status, updatedAt: observed.createdAt, events }, viewer)
        })
        return res.json({ ok: true, requests })
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const action = clean(body.action, 40)
      const now = dependencies.now().toISOString()
      if (action === 'create') {
        const providerEmail = clean(body.providerEmail, 254).toLowerCase()
        if (!EMAIL.test(providerEmail)) fail('Enter a valid service provider email.', 400)
        const provider = accountKey(cfg.secret, providerEmail)
        if (provider === viewer) fail('Customer and service provider must be different accounts.', 409)
        const idempotency = clean(req.headers['idempotency-key'], 160)
        if (idempotency.length < 8) fail('Idempotency-Key must contain at least 8 characters.', 400)
        const scoped = createHmac('sha256', viewer).update(`service-request\0${idempotency}`).digest('hex')
        let created!: ServiceRequest
        await dependencies.mutateRequests(cfg.requestStore, current => {
          const next = safeStore(current); const replay = next.idempotency[scoped]
          if (replay && next.requests[replay]) { created = next.requests[replay]; return next }
          const terms = parseTerms(body, 'customer', 1, now)
          const id = dependencies.id(); created = { id, customerAccountKey: viewer, providerAccountKey: provider, providerLabel: maskEmail(providerEmail), status: 'sent', activeVersion: 1, terms: [terms], events: [{ id: `${id}:1`, type: 'request.created', actor: 'customer', createdAt: now, version: 1 }], createdAt: now, updatedAt: now }
          next.requests[id] = created; next.idempotency[scoped] = id; return next
        })
        return res.status(201).json({ ok: true, request: publicRequest(created, viewer) })
      }
      const payerAction = ({
        payer_review: 'review',
        payer_link_wallet: 'link-wallet',
        payer_prepare: 'prepare',
        payer_challenge: 'challenge',
        payer_record: 'record',
        payer_recover: 'recover',
        payer_status: 'status',
        payer_lifecycle_challenge: 'lifecycle-challenge',
        payer_lifecycle_recover: 'lifecycle-recover',
        payer_lifecycle_record: 'lifecycle-record',
        payer_lifecycle_status: 'lifecycle-status',
      } as Record<string, string>)[action]
      if (payerAction) {
        const requestId = clean(body.requestId, 80)
        const stored = await dependencies.readRequests(cfg.requestStore)
        const item = stored?.requests?.[requestId]
        if (!item || item.customerAccountKey !== viewer) fail('Request not found.', 404)
        if (item.status !== 'awaiting_funding' || !item.agreementId || !item.payerReviewPath) {
          fail('This request is not ready for customer funding.', 409)
        }
        const fragment = item.payerReviewPath.split('#', 2)[1] ?? ''
        const capability = new URLSearchParams(fragment).get('access')?.trim() ?? ''
        if (!/^agrp_[A-Za-z0-9_-]{40,100}$/.test(capability)) fail('Agreement payer access is unavailable.', 503)
        const terms = item.terms.find(term => term.version === item.activeVersion)
        if (!terms) fail('The accepted request terms are unavailable.', 409)
        const apiKey = clean(env[terms.upfrontRequested ? 'HASHPAYSTREAM_UPFRONT_ARC_API_KEY' : 'HASHPAYSTREAM_ARC_API_KEY'], 200)
        if (!apiKey.startsWith('hpl_test_')) fail('Agreement funding is temporarily unavailable.', 503)
        const forwarded: Record<string, unknown> = {
          agreementId: item.agreementId,
          payerEmail: identity.email,
          action: payerAction,
        }
        if (payerAction === 'link-wallet') {
          const wallet = body.wallet && typeof body.wallet === 'object' && !Array.isArray(body.wallet) ? body.wallet as Record<string, unknown> : {}
          forwarded.circleUserToken = clean(body.circleUserToken, 8_000)
          forwarded.wallet = { id: clean(wallet.id, 180), address: clean(wallet.address, 42), blockchain: clean(wallet.blockchain, 40) }
        } else if (['prepare', 'challenge', 'record', 'recover', 'lifecycle-challenge', 'lifecycle-recover', 'lifecycle-record'].includes(payerAction)) {
          forwarded.circleUserToken = clean(body.circleUserToken, 8_000)
          if (payerAction === 'challenge' || payerAction === 'record' || payerAction === 'recover') forwarded.stage = clean(body.stage, 20)
          if (payerAction === 'record') forwarded.transactionHash = clean(body.transactionHash, 66)
          if (payerAction === 'lifecycle-challenge') forwarded.lifecycleAction = clean(body.lifecycleAction, 20)
          if (payerAction === 'lifecycle-record') forwarded.transactionHash = clean(body.transactionHash, 66)
        }
        const upstreamResult = await dependencies.payerUpstream(cfg.base, apiKey, capability, forwarded)
        if (upstreamResult.status < 200 || upstreamResult.status >= 300 || upstreamResult.body.ok !== true) {
          fail(clean(upstreamResult.body.error, 300) || 'Agreement funding could not continue.', upstreamResult.status >= 400 && upstreamResult.status < 600 ? upstreamResult.status : 502)
        }
        return res.status(upstreamResult.status).json(upstreamResult.body)
      }
      const requestId = clean(body.requestId, 80)
      let result!: ServiceRequest
      await dependencies.mutateRequests(cfg.requestStore, current => {
        const next = safeStore(current); const item = next.requests[requestId]
        if (!item || (item.customerAccountKey !== viewer && item.providerAccountKey !== viewer)) fail('Request not found.', 404)
        const role: Role = item.customerAccountKey === viewer ? 'customer' : 'provider'
        if (['declined', 'cancelled', 'funded', 'awaiting_funding'].includes(item.status)) fail('This request can no longer be changed.', 409)
        const version = Number(body.version)
        if (!Number.isInteger(version) || version !== item.activeVersion) fail('These terms changed. Review the latest version.', 409)
        const updated = { ...item, terms: [...item.terms], events: [...item.events], updatedAt: now }
        if (action === 'provider_accept') {
          if (role !== 'provider' || !['sent', 'countered'].includes(item.status)) fail('Only the invited service provider can accept these terms.', 403)
          updated.providerAcceptedVersion = version; updated.status = 'provider_accepted'
        } else if (action === 'provider_counter') {
          if (role !== 'provider' || !['sent', 'countered'].includes(item.status)) fail('Only the invited service provider can propose new terms.', 403)
          const terms = parseTerms(body, 'provider', version + 1, now, item.terms[item.terms.length - 1]); updated.terms.push(terms); updated.activeVersion = terms.version; updated.providerAcceptedVersion = terms.version; updated.customerAcceptedVersion = undefined; updated.status = 'countered'
        } else if (action === 'provider_decline') {
          if (role !== 'provider') fail('Only the invited service provider can decline.', 403); updated.status = 'declined'
        } else if (action === 'customer_cancel') {
          if (role !== 'customer') fail('Only the customer can cancel.', 403); updated.status = 'cancelled'
        } else if (action === 'customer_accept') {
          if (role !== 'customer' || !['countered', 'provider_accepted'].includes(item.status) || item.providerAcceptedVersion !== version) fail('The service provider must accept the current terms first.', 409)
          updated.customerAcceptedVersion = version; updated.status = 'provider_accepted'
        } else fail('Request action is invalid.', 400)
        // Customer acceptance is committed only after Hash PayLink creates the
        // agreement and the local ownership record is stored. Keeping the
        // event out of this provisional mutation prevents failed upstream
        // attempts from appearing as completed acceptance notifications.
        if (action !== 'customer_accept') updated.events.push({ id: `${item.id}:${updated.events.length + 1}`, type: `request.${action}`, actor: role, createdAt: now, version: updated.activeVersion })
        next.requests[item.id] = updated; result = updated; return next
      })
      if (action === 'customer_accept' && !result.agreementId) {
        const rollbackAcceptance = async () => {
          await dependencies.mutateRequests(cfg.requestStore, current => { const next = safeStore(current); const item = next.requests[result.id]; if (item && !item.agreementId) { item.status = 'provider_accepted'; item.customerAcceptedVersion = undefined; item.events = item.events.filter(event => event.type !== 'request.customer_accept'); item.updatedAt = now } return next })
        }
        try {
          const terms = result.terms.find(item => item.version === result.activeVersion)!
          const accounts = await dependencies.readAccounts(cfg.accountStore)
          const provider = accounts?.accounts?.[result.providerAccountKey]
          if (!provider?.walletAddress || !isAddress(provider.walletAddress)) fail('The service provider must finish Circle wallet setup before you can accept and fund.', 409)
          const upfront = terms.upfrontRequested
          const apiKey = clean(env[upfront ? 'HASHPAYSTREAM_UPFRONT_ARC_API_KEY' : 'HASHPAYSTREAM_ARC_API_KEY'], 200)
          if (!apiKey.startsWith('hpl_test_')) fail('Agreement creation is temporarily unavailable.', 503)
          const recipient = upfront ? clean(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 42) : getAddress(provider.walletAddress)
          if (!isAddress(recipient)) fail('Agreement recipient routing is unavailable.', 503)
          if (!upfront) {
            const registrySecret = clean(env.HASHPAYSTREAM_DIRECT_RECIPIENT_REGISTRY_SECRET, 300)
            if (registrySecret.length < 32) fail('Direct recipient verification is temporarily unavailable.', 503)
            const registered = await dependencies.registerRecipient(cfg.base, apiKey, registrySecret, recipient, result.providerAccountKey, dependencies.now())
            if (registered.status < 200 || registered.status >= 300 || registered.body.ok !== true) fail(clean(registered.body.error, 300) || 'The service provider wallet could not be verified for Direct payment.', registered.status >= 400 && registered.status < 600 ? registered.status : 502)
          }
          const created = await dependencies.upstream(cfg.base, apiKey, { template: 'fixed_unlock', title: terms.title, description: terms.description, amount: terms.amount, payerEmail: identity.email, recipient, durationSeconds: terms.durationSeconds, cancellationWindowSeconds: terms.cancellationWindowSeconds, externalId: `hps-request-${result.id.slice(-24)}`, resourceId: `request:${result.id}` }, `hps-request:${result.id}:${terms.version}`)
          if (created.status < 200 || created.status >= 300 || created.body.ok !== true) fail(clean(created.body.error, 300) || 'The protected agreement could not be created.', created.status >= 400 && created.status < 600 ? created.status : 502)
          const agreement = created.body.agreement && typeof created.body.agreement === 'object' ? created.body.agreement as Record<string, unknown> : {}
          const agreementId = clean(agreement.id, 80); const payerReviewPath = clean(created.body.payerReviewPath, 500)
          if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId) || !payerReviewPath.startsWith('/')) fail('Hash PayLink returned an invalid agreement.', 502)
          const ownershipKey = upfront ? cfg.upfrontStore : cfg.humanStore
          const providerOwner = createHmac('sha256', cfg.secret).update(`hashpaystream.service-request-owner\0${result.providerAccountKey}`).digest('hex')
          await dependencies.mutateOwnership(ownershipKey, current => { const next = safeOwnership(current); next.agreements[agreementId] = { agreementId, ownerHash: providerOwner, ownerAccountKey: result.providerAccountKey, payerHash: payerHash(cfg.secret, identity.email), payerReviewPath, source: upfront ? 'upfront' : 'human', serviceRequestId: result.id, createdAt: now, updatedAt: now }; return next })
          await dependencies.mutateRequests(cfg.requestStore, current => { const next = safeStore(current); const item = next.requests[result.id]; if (!item?.agreementId) { item.agreementId = agreementId; item.payerReviewPath = payerReviewPath; item.status = 'awaiting_funding'; if (!item.events.some(event => event.type === 'request.customer_accept' && event.version === item.activeVersion)) item.events.push({ id: `${item.id}:${item.events.length + 1}`, type: 'request.customer_accept', actor: 'customer', createdAt: now, version: item.activeVersion }); item.updatedAt = now } result = item; return next })
        } catch (error) {
          await rollbackAcceptance()
          throw error
        }
      }
      return res.json({ ok: true, request: publicRequest(result, viewer) })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'HashPayStream requests are temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createServiceRequestsHandler()
