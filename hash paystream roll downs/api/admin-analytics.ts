import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { withHashPayStreamRequestId } from './request-telemetry.js'
import { readDurableJson } from './durable-store.js'

export type AnalyticsMode = 'human' | 'upfront' | 'agentic'
export type UpstreamResult = { status: number; body: Record<string, unknown>; latencyMs: number }

type OwnershipStore = {
  schema?: number
  agreements?: Record<string, { agreementId?: string }>
}

export type AdminAnalyticsDependencies = {
  identityEmails: (req: Request, env: NodeJS.ProcessEnv) => Promise<string[]>
  ownership: (key: string) => Promise<OwnershipStore | undefined>
  upstream: (mode: AnalyticsMode, env: NodeJS.ProcessEnv, agreementIds: string[]) => Promise<UpstreamResult>
  env: () => NodeJS.ProcessEnv
  now: () => Date
  logError: (event: {
    component: 'hashpaystream-admin-analytics'
    event: 'request_failed'
    status: number
    requestId?: string
  }) => void
}

type Agreement = Record<string, unknown> & {
  status?: string
  template?: string
  createdAt?: string
  updatedAt?: string
  chain?: Record<string, unknown> | null
  timeline?: unknown[]
  deliveryTimeline?: unknown[]
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

function adminEmails(env: NodeJS.ProcessEnv) {
  return new Set(String(env.HASHPAYSTREAM_ADMIN_EMAILS ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
}

async function verifiedIdentityEmails(req: Request, env: NodeJS.ProcessEnv) {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) throw httpError('HashPayStream authentication is unavailable.', 503)
  if (!token) throw httpError('Sign in to view analytics.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    if (!userId) throw new Error('Privy identity is empty.')
    const user = await privy.users()._get(userId)
    return user.linked_accounts.flatMap(account => account.type === 'email'
      ? [account.address.trim().toLowerCase()]
      : [])
  } catch (cause) {
    throw Object.assign(httpError('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function upstreamConfiguration(mode: AnalyticsMode, env: NodeJS.ProcessEnv) {
  const apiKey = clean(
    mode === 'human'
      ? env.HASHPAYSTREAM_ARC_API_KEY
      : mode === 'upfront'
        ? env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY
        : env.HASHPAYSTREAM_AGENT_ARC_API_KEY,
    200,
  )
  const rawBaseUrl = clean(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 240)
  let baseUrl: URL
  try {
    baseUrl = new URL(rawBaseUrl)
  } catch {
    throw httpError('HashPayStream upstream URL is invalid.', 503)
  }
  if (!apiKey.startsWith('hpl_test_') || apiKey.length < 32) {
    throw httpError(`HashPayStream ${mode} analytics source is unavailable.`, 503)
  }
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw httpError('HashPayStream upstream URL is invalid.', 503)
  }
  return { apiKey, baseUrl: baseUrl.origin }
}

async function upstreamAgreements(mode: AnalyticsMode, env: NodeJS.ProcessEnv, agreementIds: string[]): Promise<UpstreamResult> {
  const config = upstreamConfiguration(mode, env)
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const query = agreementIds.length
      ? `ids=${encodeURIComponent(agreementIds.join(','))}`
      : 'limit=1'
    const response = await fetch(`${config.baseUrl}/api/v2/agreements?${query}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'x-api-key': config.apiKey, accept: 'application/json' },
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    return { status: response.status, body, latencyMs: Math.max(0, Date.now() - startedAt) }
  } catch (cause) {
    throw Object.assign(httpError('Hash PayLink Agreements is temporarily unavailable.', 503), { cause })
  } finally {
    clearTimeout(timer)
  }
}

const defaults: AdminAnalyticsDependencies = {
  identityEmails: verifiedIdentityEmails,
  ownership: key => readDurableJson<OwnershipStore>(key),
  upstream: upstreamAgreements,
  env: () => process.env,
  now: () => new Date(),
  logError: event => console.error(JSON.stringify(event)),
}

function records(value: unknown): Agreement[] {
  return Array.isArray(value)
    ? value.filter(candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate)) as Agreement[]
    : []
}

function events(value: unknown) {
  return records(value).flatMap(event => {
    const name = clean(event.event, 80)
    const createdAt = clean(event.createdAt, 64)
    return name && Number.isFinite(Date.parse(createdAt)) ? [{ name, createdAt }] : []
  })
}

function firstEvent(agreement: Agreement, name: string) {
  return [...events(agreement.timeline), ...events(agreement.deliveryTimeline)]
    .filter(event => event.name === name)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]?.createdAt
}

function timestamp(value: unknown) {
  const text = clean(value, 64)
  return Number.isFinite(Date.parse(text)) ? text : undefined
}

function units(value: unknown) {
  const text = clean(value, 80)
  return /^\d+$/.test(text) ? BigInt(text) : 0n
}

function decimalUsdc(value: bigint) {
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function averageHours(values: number[]) {
  if (!values.length) return null
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length / 3_600_000) * 10) / 10
}

function day(value: string) {
  return value.slice(0, 10)
}

function aggregate(human: Agreement[], upfront: Agreement[], agentic: Agreement[], now: Date, sources: Record<AnalyticsMode, UpstreamResult>) {
  const tagged = [
    ...human.map(agreement => ({ mode: 'human' as const, agreement })),
    ...upfront.map(agreement => ({ mode: 'upfront' as const, agreement })),
    ...agentic.map(agreement => ({ mode: 'agentic' as const, agreement })),
  ]
  const status = (name: string) => tagged.filter(item => clean(item.agreement.status, 40) === name).length
  const hasEvent = (agreement: Agreement, name: string) => Boolean(firstEvent(agreement, name))
  const funded = tagged.filter(item => hasEvent(item.agreement, 'agreement.activated') || Boolean(item.agreement.chain))
  const protectedUnits = funded.reduce((total, item) => total + units(item.agreement.chain?.amountUsdcUnits), 0n)
  const releasedUnits = tagged.reduce((total, item) => total + units(item.agreement.chain?.releasedUsdcUnits), 0n)
  const remainingUnits = tagged.reduce((total, item) => total + units(item.agreement.chain?.remainingUsdcUnits), 0n)
  const fundingDurations = tagged.flatMap(({ agreement }) => {
    const created = timestamp(agreement.createdAt)
    const activated = firstEvent(agreement, 'agreement.activated')
    return created && activated && Date.parse(activated) >= Date.parse(created)
      ? [Date.parse(activated) - Date.parse(created)]
      : []
  })
  const reviewDurations = tagged.flatMap(({ agreement }) => {
    const submitted = firstEvent(agreement, 'delivery.submitted')
    const approved = firstEvent(agreement, 'delivery.release_approved') ?? firstEvent(agreement, 'agreement.completed')
    return submitted && approved && Date.parse(approved) >= Date.parse(submitted)
      ? [Date.parse(approved) - Date.parse(submitted)]
      : []
  })
  const latestLifecycleAt = tagged.flatMap(({ agreement }) => [
    ...events(agreement.timeline),
    ...events(agreement.deliveryTimeline),
  ]).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.createdAt ?? null
  const daily = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (13 - index)))
    const key = date.toISOString().slice(0, 10)
    return {
      date: key,
      created: tagged.filter(item => day(timestamp(item.agreement.createdAt) ?? '') === key).length,
      completed: tagged.filter(item => day(firstEvent(item.agreement, 'agreement.completed') ?? '') === key).length,
    }
  })
  const structures = ['fixed_unlock', 'progressive_release', 'milestone'].map(template => ({
    template,
    count: tagged.filter(item => clean(item.agreement.template, 40) === template).length,
  }))
  const completed = status('completed')
  return {
    generatedAt: now.toISOString(),
    environment: 'Arc Testnet',
    scope: { ownedAgreements: tagged.length, projects: ['human', 'upfront', 'agentic'] },
    totals: {
      agreements: tagged.length,
      awaitingFunding: status('awaiting_start'),
      active: status('active'),
      completed,
      cancelled: status('cancelled'),
      refunded: status('refunded'),
      refundAvailable: status('expired'),
    },
    modes: { human: human.length, upfront: upfront.length, agentic: agentic.length },
    funnel: {
      created: tagged.length,
      funded: funded.length,
      deliverySubmitted: tagged.filter(item => hasEvent(item.agreement, 'delivery.submitted')).length,
      releaseApproved: tagged.filter(item => hasEvent(item.agreement, 'delivery.release_approved')).length,
      completed,
    },
    structures,
    testUsdc: {
      protected: decimalUsdc(protectedUnits),
      released: decimalUsdc(releasedUnits),
      remaining: decimalUsdc(remainingUnits),
    },
    performance: {
      fundedCompletionRate: funded.length ? Math.round((completed / funded.length) * 1_000) / 10 : null,
      averageFundingHours: averageHours(fundingDurations),
      averageDeliveryReviewHours: averageHours(reviewDurations),
    },
    daily,
    infrastructure: {
      hashPayLink: {
        human: { reachable: true, latencyMs: sources.human.latencyMs },
        upfront: { reachable: true, latencyMs: sources.upfront.latencyMs },
        agentic: { reachable: true, latencyMs: sources.agentic.latencyMs },
      },
      latestLifecycleAt,
    },
    circleMarketplace: {
      requestAnalyticsRecorded: false,
      note: 'Historical Circle Marketplace requests are not yet persisted.',
    },
    privacy: 'Aggregated lifecycle metrics only. No identities, wallet addresses, private URLs, agreement IDs, or transaction hashes.',
  }
}

export async function readHashPayStreamAnalytics(
  env: NodeJS.ProcessEnv,
  now: Date,
  upstream: AdminAnalyticsDependencies['upstream'] = upstreamAgreements,
  ownership: AdminAnalyticsDependencies['ownership'] = key => readDurableJson<OwnershipStore>(key),
) {
  const ownershipKeys: Record<AnalyticsMode, string> = {
    human: clean(env.HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY ?? 'hashpaystream:human-agreement-owners:v1', 160),
    upfront: clean(env.HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY ?? 'hashpaystream:upfront-agreement-owners:v1', 160),
    agentic: clean(env.HASHPAYSTREAM_AGENT_AGREEMENT_STORE_KEY ?? 'hashpaystream:agent-agreement-owners:v1', 160),
  }
  if (new Set(Object.values(ownershipKeys)).size !== 3 || Object.values(ownershipKeys).some(key => !key)) {
    throw httpError('Human, Upfront, and agent agreement ownership stores must be separate.', 503)
  }
  const [humanOwned, upfrontOwned, agentOwned] = await Promise.all([
    ownership(ownershipKeys.human), ownership(ownershipKeys.upfront), ownership(ownershipKeys.agentic),
  ])
  const agreementIds = (owned: OwnershipStore | undefined) => Object.entries(owned?.agreements ?? {}).flatMap(([key, record]) => {
    const id = clean(record?.agreementId ?? key, 80)
    return /^agr_[a-z0-9]{12,64}$/i.test(id) ? [id] : []
  }).slice(0, 100)
  const idsByMode = {
    human: agreementIds(humanOwned),
    upfront: agreementIds(upfrontOwned),
    agentic: agreementIds(agentOwned),
  }
  const allIds = [...idsByMode.human, ...idsByMode.upfront, ...idsByMode.agentic]
  if (new Set(allIds).size !== allIds.length) throw httpError('Agreement ownership is duplicated across human and agent stores.', 503)
  const [human, upfront, agentic] = await Promise.all([
    upstream('human', env, idsByMode.human),
    upstream('upfront', env, idsByMode.upfront),
    upstream('agentic', env, idsByMode.agentic),
  ])
  for (const source of [human, upfront, agentic]) {
    if (source.status !== 200 || source.body.ok !== true || !Array.isArray(source.body.agreements)) {
      throw httpError('Hash PayLink Agreements is temporarily unavailable.', 502)
    }
  }
  const scoped = (source: UpstreamResult, ids: string[]) => {
    const ownedSet = new Set(ids)
    return records(source.body.agreements).filter(agreement => {
    const id = clean(agreement.id ?? agreement.agreementId, 80)
    return ownedSet.has(id)
    })
  }
  return aggregate(scoped(human, idsByMode.human), scoped(upfront, idsByMode.upfront), scoped(agentic, idsByMode.agentic), now, { human, upfront, agentic })
}

export function createHashPayStreamAdminAnalytics(overrides: Partial<AdminAnalyticsDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function hashPayStreamAdminAnalytics(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      const env = dependencies.env()
      const allowed = adminEmails(env)
      if (!allowed.size) throw httpError('HashPayStream analytics is unavailable.', 503)
      const identities = await dependencies.identityEmails(req, env)
      if (!identities.some(email => allowed.has(email.toLowerCase()))) {
        throw httpError('You do not have access to HashPayStream analytics.', 403)
      }
      return res.json({
        ok: true,
        analytics: await readHashPayStreamAnalytics(env, dependencies.now(), dependencies.upstream, dependencies.ownership),
      })
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status) || 500
      if (status >= 500) dependencies.logError(withHashPayStreamRequestId({
        component: 'hashpaystream-admin-analytics',
        event: 'request_failed',
        status,
      }))
      return res.status(status).json({
        ok: false,
        error: status >= 500 ? 'HashPayStream analytics is temporarily unavailable.' : (error as Error).message,
      })
    }
  }
}

export default createHashPayStreamAdminAnalytics()
