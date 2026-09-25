import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from './durable-store.js'

const ORIGIN = 'https://app.hashpaylink.com'
type Identity = { userId: string; email: string }
export type HostedAccount = { subject: string; hashPayLinkUserId: string; walletAppId: string; linkedAt: number }
type RecordValue = { subject: string; projectName?: string; pending?: { id: string; emailHash: string; encrypted: string; expiresAt: number }; linked?: HostedAccount }
type Config = { apiKey: string; secret: string; appId: string; sourceAppId: string }
type Deps = {
  env: () => NodeJS.ProcessEnv; now: () => number; hasStore: () => boolean;
  identity: (req: Request, env: NodeJS.ProcessEnv) => Promise<Identity>;
  read: (key: string) => Promise<RecordValue | undefined>;
  mutate: (key: string, update: (record: RecordValue | undefined) => Promise<RecordValue>) => Promise<RecordValue>;
  upstream: (body: object, config: Config) => Promise<{ status: number; body: Record<string, unknown> }>;
}
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }) }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function configuration(env: NodeJS.ProcessEnv): Config {
  const apiKey = env.HASHPAYSTREAM_WALLET_CONNECTION_API_KEY?.trim() || ''
  const secret = env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET?.trim() || ''
  const appId = env.HASHPAYSTREAM_HASH_PAYLINK_PRIVY_APP_ID?.trim() || ''
  const sourceAppId = (env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID)?.trim() || ''
  if (!/^hpl_app_[a-f0-9]{64}$/.test(apiKey) || secret.length < 32 || !appId || !sourceAppId) fail(503, 'Account connection is not configured.')
  return { apiKey, secret, appId, sourceAppId }
}
function subjectFor(identity: Identity, config: Config) {
  return createHmac('sha256', config.secret).update(JSON.stringify(['hashpaystream.hosted-account.v1', config.sourceAppId, identity.userId])).digest('hex')
}
const storeKey = (subject: string) => `hashpaystream:hosted-account:v1:${subject}`
function seal(value: object, secret: string, subject: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update('hosted-account-seal\0'+secret).digest(), iv)
  cipher.setAAD(Buffer.from(subject))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}
function unseal(value: string, secret: string, subject: string): { verifier: string; connectUrl: string } {
  const bytes = Buffer.from(value, 'base64url'), decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update('hosted-account-seal\0'+secret).digest(), bytes.subarray(0,12))
  decipher.setAAD(Buffer.from(subject)); decipher.setAuthTag(bytes.subarray(12,28))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'))
}
async function identity(req: Request, env: NodeJS.ProcessEnv): Promise<Identity> {
  const appId = env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID, appSecret = env.PRIVY_APP_SECRET
  if (!appId || !appSecret) fail(503, 'Authentication is unavailable.')
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) fail(401, 'Sign in to continue.')
  try {
    const client = new PrivyClient({ appId, appSecret })
    const claims = await client.utils().auth().verifyAccessToken(token)
    const user = await client.users()._get(claims.user_id)
    const emails = user.linked_accounts.flatMap(a => a.type === 'email' ? [a.address.toLowerCase()] : [])
    if (emails.length !== 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emails[0])) fail(401, 'Use an account with one verified email.')
    return { userId: claims.user_id, email: emails[0] }
  } catch { return fail(401, 'Sign in again to connect your account.') }
}
async function upstream(body: object, config: Config) {
  const response = await fetch(ORIGIN + '/api/v2/wallet-connections', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => fail(502, 'Account connection service is unavailable. Try again.'))
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(502, 'Invalid account connection response.')
  return { status: response.status, body: data as Record<string, unknown> }
}
export function createHostedAccountHandler(overrides: Partial<Deps> = {}) {
  const d: Deps = { env: () => process.env, now: Date.now, hasStore: hasRenderDurableStore, identity, read: readDurableJson, mutate: mutateDurableJson, upstream, ...overrides }
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (!['GET','POST'].includes(req.method)) fail(405, 'Method not allowed.')
      const env = d.env(), who = await d.identity(req, env)
      if (env.HASHPAYSTREAM_HOSTED_ACCOUNT_ENABLED !== 'true') {
        if (req.method === 'GET') return res.json({ ok: true, enabled: false, connected: false })
        fail(503, 'Account connection is not enabled yet.')
      }
      const config = configuration(env), subject = subjectFor(who, config), key = storeKey(subject)
      if (!d.hasStore()) fail(503, 'Account storage is unavailable.')
      const assertRecord = (record?: RecordValue) => {
        if (record && record.subject !== subject) fail(409, 'Account record mismatch.')
        if (record?.linked && record.linked.walletAppId !== config.appId) fail(409, 'Wallet configuration changed. Contact support.')
      }
      if (req.method === 'GET') {
        const current = await d.read(key); assertRecord(current)
        return res.json({ ok: true, enabled: true, connected: Boolean(current?.linked), projectName: current?.projectName, pending: Boolean(current?.pending && current.pending.expiresAt > d.now()) })
      }
      const action = req.body?.action
      if (!['start','complete'].includes(action)) fail(400, 'Choose start or complete.')
      let connectUrl: string | undefined
      const result = await d.mutate(key, async current => {
        assertRecord(current)
        if (current?.linked) return current
        const pending = current?.pending
        const emailHash = hash(who.email.toLowerCase())
        if (action === 'start') {
          if (pending && pending.expiresAt > d.now() && pending.emailHash === emailHash) {
            connectUrl = unseal(pending.encrypted, config.secret, subject).connectUrl
            return current!
          }
          const verifier = randomBytes(32).toString('base64url')
          const reply = await d.upstream({ action: 'create', subject, email: who.email, challenge: hash(verifier) }, config)
          const { id, expiresAt, connectPath } = reply.body
          if (reply.status !== 201 || reply.body.ok !== true || typeof id !== 'string' || !/^wcs_[a-f0-9]{48}$/.test(id)
            || typeof expiresAt !== 'number' || expiresAt <= d.now() || expiresAt > d.now()+600000
            || typeof connectPath !== 'string' || !new RegExp('^/wallet/connect/'+id+'#access=[A-Za-z0-9_-]{43}$').test(connectPath)) fail(502, 'Could not start the account connection. Try again.')
          connectUrl = ORIGIN + connectPath
          return { subject, projectName: typeof reply.body.projectName === 'string' ? reply.body.projectName.trim().slice(0,160) : undefined, pending: { id, emailHash, expiresAt, encrypted: seal({ verifier, connectUrl }, config.secret, subject) } }
        }
        if (!pending || pending.expiresAt <= d.now()) fail(409, 'Connection expired. Start again.')
        if (pending.emailHash !== emailHash) fail(409, 'Your sign-in email changed. Start again.')
        const { verifier } = unseal(pending.encrypted, config.secret, subject)
        const reply = await d.upstream({ action: 'redeem', id: pending.id, verifier }, config)
        if (reply.status === 409) fail(409, 'Approve the connection in Hash PayLink, then check again.')
        if (reply.status !== 200 || reply.body.ok !== true || reply.body.subject !== subject || reply.body.walletAppId !== config.appId
          || typeof reply.body.hashPayLinkUserId !== 'string' || !/^did:privy:[A-Za-z0-9_-]+$/.test(reply.body.hashPayLinkUserId)) fail(502, 'Account connection could not be verified. Start again.')
        return { subject, projectName: typeof reply.body.projectName === 'string' ? reply.body.projectName.trim().slice(0,160) : current?.projectName, linked: { subject, hashPayLinkUserId: reply.body.hashPayLinkUserId, walletAppId: config.appId, linkedAt: d.now() } }
      })
      return res.json({ ok: true, enabled: true, connected: Boolean(result.linked), projectName: result.projectName, ...(connectUrl ? { connectUrl } : {}) })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Account connection is temporarily unavailable. Try again later.' : (error as Error).message })
    }
  }
}
export default createHostedAccountHandler()
