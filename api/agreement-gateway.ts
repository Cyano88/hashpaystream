import { createHmac } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from './durable-store.js'

const DEFAULT_STORE_KEY = 'hashpaystream:agreement-owners:v1'
const DEFAULT_EVENT_STORE_KEY = 'hashpaystream:arc-webhooks:v1'
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
const EVENT_ID = /^evt_[a-z0-9]{12,64}$/i
const LIFECYCLE_STATUS: Record<string, string> = {
  'agreement.activated': 'active',
  'agreement.step_released': 'active',
  'agreement.expired': 'expired',
  'agreement.completed': 'completed',
  'agreement.cancelled': 'cancelled',
  'agreement.refunded': 'refunded',
}
const TERMINAL_AGREEMENT_STATUSES = new Set(['completed', 'cancelled', 'refunded'])

type OwnedAgreement = {
  agreementId: string
  ownerHash: string
  createdAt: string
  updatedAt: string
}

type OwnershipStore = {
  schema: 1
  agreements: Record<string, OwnedAgreement>
  idempotency: Record<string, string>
}

type StoredAgreementEvent = {
  id: string
  event: string
  agreementId: string
  createdAt: string
  receivedAt: string
  data: Record<string, unknown>
}

type AgreementEventStore = {
  schema: 1
  events: Record<string, StoredAgreementEvent>
}

type UpstreamResponse = {
  status: number
  body: Record<string, unknown>
}

export type AgreementGatewayDependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<OwnershipStore | undefined>
  readEvents: (key: string) => Promise<AgreementEventStore | undefined>
  mutate: (key: string, update: (current: OwnershipStore | undefined) => OwnershipStore) => Promise<OwnershipStore>
  identity: (req: Request) => Promise<string>
  upstream: (input: {
    method: 'GET' | 'POST'
    path: string
    body?: Record<string, unknown>
    idempotencyKey?: string
  }) => Promise<UpstreamResponse>
  env: () => NodeJS.ProcessEnv
  now: () => Date
  logError: (message: string) => void
}

type AgreementGatewayOptions = {
  checkoutMode?: 'human' | 'agentic'
  agentActivation?: boolean
}

function clean(value: unknown, maximum: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function bearer(req: Pick<Request, 'headers'>) {
  return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

async function verifiedIdentity(req: Request) {
  const appId = clean(process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(process.env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) throw httpError('HashPayStream authentication is unavailable.', 503)
  if (!token) throw httpError('Sign in to manage agreements.', 401)
  try {
    const claims = await new PrivyClient({ appId, appSecret }).utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    if (!userId) throw new Error('Privy identity is empty.')
    return userId
  } catch (cause) {
    throw Object.assign(httpError('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function configuration(env: NodeJS.ProcessEnv) {
  const apiKey = clean(env.HASHPAYSTREAM_ARC_API_KEY, 200)
  const ownershipSecret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const storeKey = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
  const eventStoreKey = clean(env.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY ?? DEFAULT_EVENT_STORE_KEY, 160)
  const rawBaseUrl = clean(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 240)
  let baseUrl: URL
  try {
    baseUrl = new URL(rawBaseUrl)
  } catch {
    throw httpError('HashPayStream upstream URL is invalid.', 503)
  }
  if (!apiKey.startsWith('hpl_test_') || apiKey.length < 32) {
    throw httpError('HashPayStream Arc API key is unavailable.', 503)
  }
  if (ownershipSecret.length < 32) throw httpError('HashPayStream ownership signing is unavailable.', 503)
  if (!storeKey || !eventStoreKey || baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw httpError('HashPayStream standalone gateway is misconfigured.', 503)
  }
  return { apiKey, ownershipSecret, storeKey, eventStoreKey, baseUrl: baseUrl.origin }
}

async function upstreamRequest(input: {
  method: 'GET' | 'POST'
  path: string
  body?: Record<string, unknown>
  idempotencyKey?: string
}, env: NodeJS.ProcessEnv) {
  const config = configuration(env)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${config.baseUrl}${input.path}`, {
      method: input.method,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'x-api-key': config.apiKey,
        accept: 'application/json',
        ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
        ...(input.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    return { status: response.status, body }
  } catch (cause) {
    throw Object.assign(httpError('Hash PayLink Agreements is temporarily unavailable.', 503), { cause })
  } finally {
    clearTimeout(timer)
  }
}

const defaults: AgreementGatewayDependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  readEvents: readDurableJson,
  mutate: (key, update) => mutateDurableJson<OwnershipStore>(key, update),
  identity: verifiedIdentity,
  upstream: input => upstreamRequest(input, process.env),
  env: () => process.env,
  now: () => new Date(),
  logError: message => console.error('[hashpaystream-agreement-gateway] request failed:', message),
}

function safeStore(current?: OwnershipStore): OwnershipStore {
  return {
    schema: 1,
    agreements: current?.schema === 1 && current.agreements ? { ...current.agreements } : {},
    idempotency: current?.schema === 1 && current.idempotency ? { ...current.idempotency } : {},
  }
}

function ownerHash(secret: string, userId: string) {
  return createHmac('sha256', secret).update(`hashpaystream.owner\0${userId}`).digest('hex')
}

function scopedIdempotency(owner: string, key: string) {
  return createHmac('sha256', owner).update(`hashpaystream.agreement\0${key}`).digest('hex')
}

function agentPayerReference(owner: string) {
  return `apr_${createHmac('sha256', owner).update('hashpaystream.agent-payer\0v1').digest('hex').slice(0, 40)}`
}

function ownedAgreement(store: OwnershipStore | undefined, agreementId: string, owner: string) {
  const record = store?.agreements?.[agreementId]
  if (!record || record.ownerHash !== owner) throw httpError('Agreement not found.', 404)
  return record
}

function upstreamError(response: UpstreamResponse) {
  const message = clean(response.body.error, 300) || 'Hash PayLink rejected the agreement request.'
  return httpError(message, response.status >= 400 && response.status < 600 ? response.status : 502)
}

function publicTimeline(eventStore: AgreementEventStore | undefined, agreementId: string) {
  return Object.values(eventStore?.events ?? {})
    .filter(event => event.agreementId === agreementId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(event => ({
      id: event.id,
      event: event.event,
      createdAt: event.createdAt,
      receivedAt: event.receivedAt,
      observedBlockNumber: clean(event.data?.observedBlockNumber, 40),
    }))
}

function publicUpstreamTimeline(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    const event = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : {}
    const id = clean(event.id, 80)
    const eventName = clean(event.event, 80)
    const createdAt = clean(event.createdAt, 64)
    const receivedAt = clean(event.receivedAt, 64)
    const observedBlockNumber = clean(event.observedBlockNumber, 40)
    if (
      !EVENT_ID.test(id)
      || !LIFECYCLE_STATUS[eventName]
      || !Number.isFinite(new Date(createdAt).getTime())
      || (receivedAt && !Number.isFinite(new Date(receivedAt).getTime()))
      || (observedBlockNumber && !/^\d{1,40}$/.test(observedBlockNumber))
    ) {
      return []
    }
    return [{
      id,
      event: eventName,
      createdAt,
      receivedAt,
      observedBlockNumber,
    }]
  })
}

function mergedTimeline(upstreamTimeline: ReturnType<typeof publicUpstreamTimeline>, webhookTimeline: ReturnType<typeof publicTimeline>) {
  const byId = new Map(upstreamTimeline.map(event => [event.id, event]))
  for (const event of webhookTimeline) byId.set(event.id, event)
  return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function reconciledLifecycleStatus(upstreamStatus: string, webhookStatus?: string) {
  if (TERMINAL_AGREEMENT_STATUSES.has(upstreamStatus)) return upstreamStatus
  if (upstreamStatus === 'expired' && webhookStatus === 'active') return upstreamStatus
  return webhookStatus || upstreamStatus
}

function standaloneAgreementView(value: unknown, eventStore: AgreementEventStore | undefined) {
  const agreement = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const agreementId = clean(agreement.id, 80)
  const webhookTimeline = publicTimeline(eventStore, agreementId)
  const timeline = mergedTimeline(publicUpstreamTimeline(agreement.timeline), webhookTimeline)
  const lifecycleStatus = webhookTimeline
    .map(event => LIFECYCLE_STATUS[event.event])
    .find(Boolean)
  const status = reconciledLifecycleStatus(clean(agreement.status, 40), lifecycleStatus)
  return {
    ...agreement,
    ...(status ? { status } : {}),
    timeline,
    deliveryTimeline: Array.isArray(agreement.deliveryTimeline) ? agreement.deliveryTimeline : [],
  }
}

function requireCheckoutMode(value: unknown, expected: 'human' | 'agentic') {
  const agreement = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  if (agreement.checkoutMode !== expected) {
    throw httpError('Hash PayLink returned an agreement for the wrong checkout mode.', 502)
  }
}

function gatewayResponse(body: Record<string, unknown>, options: Required<AgreementGatewayOptions>) {
  if (!options.agentActivation) return body
  const {
    payerAccessToken: _payerAccessToken,
    payerReviewPath: _payerReviewPath,
    nextAction: _nextAction,
    ...safe
  } = body
  return { ...safe, agentActivationPilot: true }
}

export function createHashPayStreamAgreementGateway(
  overrides: Partial<AgreementGatewayDependencies> = {},
  inputOptions: AgreementGatewayOptions = {},
) {
  const options: Required<AgreementGatewayOptions> = {
    checkoutMode: inputOptions.checkoutMode ?? 'human',
    agentActivation: inputOptions.agentActivation ?? false,
  }
  const dependencies = { ...defaults, ...overrides }
  if (!overrides.upstream) {
    dependencies.upstream = input => upstreamRequest(input, dependencies.env())
  }
  return async function hashPayStreamAgreementGateway(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      if (!dependencies.hasStore()) throw httpError('HashPayStream ownership storage is unavailable.', 503)
      const config = configuration(dependencies.env())
      const userId = await dependencies.identity(req)
      const owner = ownerHash(config.ownershipSecret, userId)
      const store = await dependencies.read(config.storeKey)
      const eventStore = req.method === 'GET' ? await dependencies.readEvents(config.eventStoreKey) : undefined

      if (req.method === 'GET') {
        const requestedId = clean(req.query?.id, 80)
        if (requestedId) {
          if (!AGREEMENT_ID.test(requestedId)) throw httpError('Agreement id is invalid.', 400)
          ownedAgreement(store, requestedId, owner)
          const upstream = await dependencies.upstream({ method: 'GET', path: `/api/v2/agreements?id=${encodeURIComponent(requestedId)}` })
          if (upstream.status !== 200 || upstream.body.ok !== true) throw upstreamError(upstream)
          requireCheckoutMode(upstream.body.agreement, options.checkoutMode)
          const agreement = standaloneAgreementView(upstream.body.agreement, eventStore)
          if (clean((agreement as Record<string, unknown>).id, 80) !== requestedId) {
            throw httpError('Hash PayLink returned an invalid agreement.', 502)
          }
          return res.json(gatewayResponse({ ...upstream.body, agreement }, options))
        }
        const owned = Object.values(store?.agreements ?? {})
          .filter(record => record.ownerHash === owner)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 100)
        if (!owned.length) return res.json(gatewayResponse({ ok: true, agreements: [] }, options))
        const requestedIds = owned.map(record => record.agreementId).join(',')
        const result = await dependencies.upstream({
          method: 'GET',
          path: `/api/v2/agreements?ids=${encodeURIComponent(requestedIds)}`,
        })
        if (result.status !== 200 || result.body.ok !== true || !Array.isArray(result.body.agreements)) {
          throw upstreamError(result)
        }
        const ownedIds = new Set(owned.map(record => record.agreementId))
        const returnedById = new Map<string, unknown>()
        for (const candidate of result.body.agreements) {
          const value = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
            ? candidate as Record<string, unknown>
            : {}
          const agreementId = clean(value.id, 80)
          if (ownedIds.has(agreementId) && !returnedById.has(agreementId)) {
            requireCheckoutMode(candidate, options.checkoutMode)
            returnedById.set(agreementId, candidate)
          }
        }
        const agreements = owned.flatMap(record => {
          const agreement = returnedById.get(record.agreementId)
          return agreement ? [standaloneAgreementView(agreement, eventStore)] : []
        })
        return res.json(gatewayResponse({ ok: true, agreements }, options))
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {}
      const action = clean(body.action, 40)
      if (action) {
        if (options.agentActivation) {
          if (![
            'prepare',
            'prepare-call',
            'record',
            'status',
            'review',
            'delivery-decision',
            'lifecycle-prepare-call',
            'lifecycle-record',
            'lifecycle-status',
          ].includes(action)) {
            throw httpError('This agent agreement action is unavailable.', 409)
          }
          const agreementId = clean(body.agreementId, 80)
          if (!AGREEMENT_ID.test(agreementId)) throw httpError('Agreement id is invalid.', 400)
          ownedAgreement(store, agreementId, owner)
          const upstream = await dependencies.upstream({
            method: 'POST',
            path: '/api/v2/agreements/agent',
            body: {
              action,
              agreementId,
              payerReference: agentPayerReference(owner),
              payerAddress: clean(body.payerAddress, 80),
              ...(action === 'prepare-call' || action === 'record' ? { stage: clean(body.stage, 20) } : {}),
              ...(action === 'record' ? { transactionHash: clean(body.transactionHash, 80) } : {}),
              ...(action === 'delivery-decision' ? {
                deliveryId: clean(body.deliveryId, 40),
                decision: clean(body.decision, 20),
                issue: clean(body.issue, 300),
              } : {}),
              ...(action === 'lifecycle-prepare-call' ? {
                lifecycleAction: clean(body.lifecycleAction, 20),
              } : {}),
              ...(action === 'lifecycle-record' ? {
                transactionHash: clean(body.transactionHash, 80),
              } : {}),
            },
          })
          if (upstream.status < 200 || upstream.status >= 300 || upstream.body.ok !== true) throw upstreamError(upstream)
          if (upstream.body.agreement) requireCheckoutMode(upstream.body.agreement, 'agentic')
          if (upstream.body.attempt) requireCheckoutMode(upstream.body.attempt, 'agentic')
          return res.status(upstream.status).json(gatewayResponse(upstream.body, options))
        }
        if (!['rotate_payer_link', 'request_release'].includes(action)) {
          throw httpError('Agreement action is not supported.', 400)
        }
        const agreementId = clean(body.agreementId, 80)
        if (!AGREEMENT_ID.test(agreementId)) throw httpError('Agreement id is invalid.', 400)
        ownedAgreement(store, agreementId, owner)
        const upstream = await dependencies.upstream({
          method: 'POST',
          path: '/api/v2/agreements',
          body: {
            action,
            agreementId,
            ...(action === 'request_release' ? {
              deliveryNote: body.deliveryNote,
              evidenceReference: body.evidenceReference,
            } : {}),
          },
        })
        if (upstream.status < 200 || upstream.status >= 300 || upstream.body.ok !== true) throw upstreamError(upstream)
        return res.status(upstream.status).json(upstream.body)
      }

      const idempotencyKey = clean(req.headers['idempotency-key'], 160)
      if (idempotencyKey.length < 8) throw httpError('Idempotency-Key must contain at least 8 characters.', 400)
      const scopedKey = scopedIdempotency(owner, idempotencyKey)
      const existingId = store?.idempotency?.[scopedKey]
      if (existingId) {
        ownedAgreement(store, existingId, owner)
        const existing = await dependencies.upstream({ method: 'GET', path: `/api/v2/agreements?id=${encodeURIComponent(existingId)}` })
        if (existing.status !== 200 || existing.body.ok !== true) throw upstreamError(existing)
        requireCheckoutMode(existing.body.agreement, options.checkoutMode)
        return res.json(gatewayResponse({ ...existing.body, replayed: true }, options))
      }
      const upstreamIdempotencyKey = `hps:${scopedKey.slice(0, 48)}`
      const upstream = await dependencies.upstream({
        method: 'POST',
        path: '/api/v2/agreements',
        idempotencyKey: upstreamIdempotencyKey,
        body: {
          ...body,
          externalId: `hps-${scopedKey.slice(0, 24)}`,
          resourceId: `agreement:${scopedKey.slice(0, 24)}`,
        },
      })
      if (upstream.status < 200 || upstream.status >= 300 || upstream.body.ok !== true) throw upstreamError(upstream)
      const agreement = upstream.body.agreement && typeof upstream.body.agreement === 'object'
        ? upstream.body.agreement as Record<string, unknown>
        : {}
      requireCheckoutMode(agreement, options.checkoutMode)
      const agreementId = clean(agreement.id, 80)
      if (!AGREEMENT_ID.test(agreementId)) throw httpError('Hash PayLink returned an invalid agreement.', 502)
      const timestamp = dependencies.now().toISOString()
      await dependencies.mutate(config.storeKey, current => {
        const next = safeStore(current)
        const existing = next.agreements[agreementId]
        if (existing && existing.ownerHash !== owner) throw httpError('Agreement ownership conflict.', 409)
        next.agreements[agreementId] = {
          agreementId,
          ownerHash: owner,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
        next.idempotency[scopedKey] = agreementId
        return next
      })
      return res.status(upstream.status).json(gatewayResponse(upstream.body, options))
    } catch (error) {
      const status = Number((error as Error & { status?: number })?.status) || 500
      if (status >= 500) dependencies.logError(error instanceof Error ? error.message : String(error))
      return res.status(status).json({
        ok: false,
        error: status >= 500 ? 'HashPayStream Agreements is temporarily unavailable.' : (error as Error).message,
      })
    }
  }
}

export default createHashPayStreamAgreementGateway()
