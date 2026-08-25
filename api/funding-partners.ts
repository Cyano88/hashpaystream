import { createHmac, randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './durable-store.js'

const DEFAULT_STORE_KEY = 'hashpaystream:funding-partners:v1'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const APPLICATION_ID = /^fpa_[a-f0-9-]{36}$/

export type FundingPartnerStatus = 'pending' | 'approved' | 'restricted'
export type FundingPartnerRecord = {
  id: string
  accountKey: string
  email: string
  name: string
  country: string
  applicantType: 'individual' | 'company'
  experience: 'new' | 'some' | 'experienced'
  expectedFundingRange: string
  status: FundingPartnerStatus
  createdAt: string
  updatedAt: string
}
export type FundingPartnerStore = { schema: 1; applications: Record<string, FundingPartnerRecord> }

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<FundingPartnerStore | undefined>
  mutate: (key: string, update: (current: FundingPartnerStore | undefined) => FundingPartnerStore) => Promise<FundingPartnerStore>
  identityEmails: (req: Request, env: NodeJS.ProcessEnv) => Promise<string[]>
  env: () => NodeJS.ProcessEnv
  now: () => Date
  id: () => string
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

async function verifiedIdentityEmails(req: Request, env: NodeJS.ProcessEnv) {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) failure('HashPayStream authentication is unavailable.', 503)
  if (!token) failure('Sign in to manage your funding profile.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const user = await privy.users()._get(clean(claims.user_id, 180))
    const emails = user.linked_accounts.flatMap(account => account.type === 'email' ? [clean(account.address, 254).toLowerCase()] : [])
    if (!emails.some(email => EMAIL.test(email))) throw new Error('Verified email is unavailable.')
    return [...new Set(emails.filter(email => EMAIL.test(email)))].sort()
  } catch (cause) {
    throw Object.assign(failure('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function emailSet(value: unknown) {
  return new Set(String(value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(item => EMAIL.test(item)))
}

function configuration(env: NodeJS.ProcessEnv) {
  const secret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const storeKey = clean(env.HASHPAYSTREAM_FUNDING_PARTNER_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
  if (secret.length < 32 || !storeKey) failure('Funding partner applications are temporarily unavailable.', 503)
  return { secret, storeKey }
}

export function fundingPartnerAccountKey(secret: string, email: string) {
  return createHmac('sha256', secret).update(`hashpaystream.funding-partner\0${email.toLowerCase()}`).digest('hex')
}

export function safeFundingPartnerStore(value?: FundingPartnerStore): FundingPartnerStore {
  return { schema: 1, applications: value?.schema === 1 && value.applications ? { ...value.applications } : {} }
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: key => readDurableJson<FundingPartnerStore>(key),
  mutate: (key, update) => mutateDurableJson<FundingPartnerStore>(key, update),
  identityEmails: verifiedIdentityEmails,
  env: () => process.env,
  now: () => new Date(),
  id: () => `fpa_${randomUUID()}`,
}

export function createFundingPartnersHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function fundingPartners(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      if (!dependencies.hasStore()) failure('Funding partner applications are temporarily unavailable.', 503)
      const env = dependencies.env()
      const config = configuration(env)
      const emails = await dependencies.identityEmails(req, env)
      const primaryEmail = emails[0]
      const accountKeys = emails.map(email => fundingPartnerAccountKey(config.secret, email))
      const store = safeFundingPartnerStore(await dependencies.read(config.storeKey))
      const record = Object.values(store.applications).find(item => accountKeys.includes(item.accountKey))
      const preapproved = emails.some(email => emailSet(env.HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS).has(email))

      if (req.method === 'GET') {
        if (clean(req.query?.review, 8) === '1') {
          const admins = emailSet(env.HASHPAYSTREAM_ADMIN_EMAILS)
          if (!emails.some(email => admins.has(email))) failure('Operator access is required.', 403)
          const applications = Object.values(store.applications)
            .map(({ accountKey: _accountKey, ...application }) => application)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          return res.json({ ok: true, applications })
        }
        return res.json({
          ok: true,
          profile: {
            email: primaryEmail,
            status: preapproved ? 'approved' : record?.status ?? 'not_applied',
            application: record ? { ...record, accountKey: undefined } : undefined,
          },
        })
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const action = clean(body.action, 24)
      if (action === 'review') {
        const admins = emailSet(env.HASHPAYSTREAM_ADMIN_EMAILS)
        if (!emails.some(email => admins.has(email))) failure('Operator access is required.', 403)
        const applicationId = clean(body.applicationId, 48)
        const status = clean(body.status, 24) as FundingPartnerStatus
        if (!APPLICATION_ID.test(applicationId) || !['approved', 'restricted'].includes(status)) failure('Review decision is invalid.', 400)
        let reviewed: FundingPartnerRecord | undefined
        await dependencies.mutate(config.storeKey, current => {
          const next = safeFundingPartnerStore(current)
          const application = next.applications[applicationId]
          if (!application) failure('Funding partner application was not found.', 404)
          reviewed = { ...application, status, updatedAt: dependencies.now().toISOString() }
          next.applications[applicationId] = reviewed
          return next
        })
        return res.json({ ok: true, application: reviewed })
      }

      if (action !== 'apply') failure('Funding partner action is invalid.', 400)
      if (record || preapproved) failure('This account already has a funding partner profile.', 409)
      const name = clean(body.name, 100)
      const country = clean(body.country, 80)
      const applicantType = clean(body.applicantType, 20) as FundingPartnerRecord['applicantType']
      const experience = clean(body.experience, 20) as FundingPartnerRecord['experience']
      const expectedFundingRange = clean(body.expectedFundingRange, 40)
      if (name.length < 2 || country.length < 2 || !['individual', 'company'].includes(applicantType) || !['new', 'some', 'experienced'].includes(experience) || !expectedFundingRange) {
        failure('Complete every funding partner application field.', 400)
      }
      const now = dependencies.now().toISOString()
      const application: FundingPartnerRecord = {
        id: dependencies.id(), accountKey: accountKeys[0], email: primaryEmail, name, country,
        applicantType, experience, expectedFundingRange, status: 'pending', createdAt: now, updatedAt: now,
      }
      await dependencies.mutate(config.storeKey, current => {
        const next = safeFundingPartnerStore(current)
        if (Object.values(next.applications).some(item => item.accountKey === application.accountKey)) {
          failure('This account already has a funding partner profile.', 409)
        }
        next.applications[application.id] = application
        return next
      })
      return res.status(201).json({ ok: true, profile: { email: primaryEmail, status: 'pending', application: { ...application, accountKey: undefined } } })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Funding partner applications are temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createFundingPartnersHandler()
