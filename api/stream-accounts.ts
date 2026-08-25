import { createHmac, randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { createPublicClient, decodeFunctionData, getAddress, http, isAddress } from 'viem'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './durable-store.js'

const DEFAULT_STORE_KEY = 'hashpaystream:accounts:v1'
const ARC_USDC = getAddress('0x3600000000000000000000000000000000000000')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HASH = /^0x[a-fA-F0-9]{64}$/
const POCKET_ID = /^\d{10}$/
const transferAbi = [{
  type: 'function', name: 'transfer', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

type Account = { accountKey: string; email: string; displayName: string; pocketId: string; walletAddress?: string; createdAt: string; updatedAt: string }
type Transfer = {
  id: string; txHash: `0x${string}`; fromAccountKey: string; toAccountKey?: string; fromPocketId: string; toPocketId?: string
  fromAddress: string; toAddress: string; amountUsdcUnits: string; createdAt: string
}
type Store = { schema: 1; accounts: Record<string, Account>; transfers: Record<string, Transfer> }
type Identity = { email: string; emails: string[]; wallets: string[] }
type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<Store | undefined>
  mutate: (key: string, update: (current: Store | undefined) => Store | Promise<Store>) => Promise<Store>
  identity: (req: Request, env: NodeJS.ProcessEnv) => Promise<Identity>
  transaction: (hash: `0x${string}`, rpcUrl: string) => Promise<{ from: string; to: string | null; input: `0x${string}`; success: boolean }>
  env: () => NodeJS.ProcessEnv; now: () => Date; id: () => string
}

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function bearer(req: Pick<Request, 'headers'>) { return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '' }

async function verifiedIdentity(req: Request, env: NodeJS.ProcessEnv): Promise<Identity> {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) fail('HashPayStream authentication is unavailable.', 503)
  if (!token) fail('Sign in to continue.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const user = await privy.users()._get(clean(claims.user_id, 180))
    const emails = user.linked_accounts.flatMap(account => account.type === 'email' ? [clean(account.address, 254).toLowerCase()] : []).filter(email => EMAIL.test(email))
    const wallets = user.linked_accounts.flatMap(account => account.type === 'wallet' && account.chain_type === 'ethereum' && account.wallet_client_type === 'privy' && account.connector_type === 'embedded' && isAddress(account.address) ? [getAddress(account.address)] : [])
    if (!emails.length) throw new Error('Verified email is unavailable.')
    return { email: emails[0], emails: [...new Set(emails)].sort(), wallets: [...new Set(wallets)] }
  } catch (cause) {
    throw Object.assign(fail('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function safeStore(value?: Store): Store {
  return value?.schema === 1 && value.accounts && value.transfers ? { schema: 1, accounts: { ...value.accounts }, transfers: { ...value.transfers } } : { schema: 1, accounts: {}, transfers: {} }
}
function configuration(env: NodeJS.ProcessEnv) {
  const secret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const storeKey = clean(env.HASHPAYSTREAM_ACCOUNT_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
  const rpcUrl = clean(env.HASHPAYSTREAM_ARC_RPC_URL ?? 'https://rpc.testnet.arc.network', 500)
  if (secret.length < 32 || !storeKey || !rpcUrl) fail('HashPayStream accounts are temporarily unavailable.', 503)
  return { secret, storeKey, rpcUrl }
}
function accountKey(secret: string, email: string) { return createHmac('sha256', secret).update(`hashpaystream.account\0${email.toLowerCase()}`).digest('hex') }
function makePocketId(secret: string, email: string, attempt = 0) {
  const digest = createHmac('sha256', secret).update(`hashpaystream.pocket-id\0${email.toLowerCase()}\0${attempt}`).digest('hex')
  return (BigInt(`0x${digest.slice(0, 16)}`) % 10_000_000_000n).toString().padStart(10, '0')
}
function displayName(email: string) {
  const words = email.split('@')[0].replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map(word => word[0]?.toUpperCase() + word.slice(1).toLowerCase()).join(' ') || 'HashPayStream member'
}
function publicAccount(account: Account) { return { displayName: account.displayName, pocketId: account.pocketId, walletAddress: account.walletAddress ?? '' } }
function ensureAccount(store: Store, identity: Identity, secret: string, now: string) {
  const keys = identity.emails.map(email => accountKey(secret, email))
  let account = Object.values(store.accounts).find(item => keys.includes(item.accountKey))
  if (!account) {
    let attempt = 0
    let nextId = makePocketId(secret, identity.email, attempt)
    while (Object.values(store.accounts).some(item => item.pocketId === nextId)) nextId = makePocketId(secret, identity.email, ++attempt)
    account = { accountKey: keys[0], email: identity.email, displayName: displayName(identity.email), pocketId: nextId, walletAddress: identity.wallets.length === 1 ? identity.wallets[0] : undefined, createdAt: now, updatedAt: now }
    store.accounts[account.accountKey] = account
  } else if (!account.walletAddress && identity.wallets.length === 1) {
    account = { ...account, walletAddress: identity.wallets[0], updatedAt: now }
    store.accounts[account.accountKey] = account
  }
  return account
}
async function readTransaction(hash: `0x${string}`, rpcUrl: string) {
  const client = createPublicClient({ transport: http(rpcUrl) })
  const [transaction, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
  return { from: transaction.from, to: transaction.to, input: transaction.input, success: receipt.status === 'success' }
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore, read: key => readDurableJson<Store>(key), mutate: (key, update) => mutateDurableJson<Store>(key, update),
  identity: verifiedIdentity, transaction: readTransaction, env: () => process.env, now: () => new Date(), id: () => `txa_${randomUUID()}`,
}

export function createStreamAccountsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function streamAccounts(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      if (!dependencies.hasStore()) fail('HashPayStream accounts are temporarily unavailable.', 503)
      const env = dependencies.env()
      const config = configuration(env)
      const identity = await dependencies.identity(req, env)
      let account!: Account
      const stored = await dependencies.mutate(config.storeKey, current => {
        const next = safeStore(current)
        account = ensureAccount(next, identity, config.secret, dependencies.now().toISOString())
        return next
      })
      if (req.method === 'GET') {
        const activity = clean(req.query?.view, 20) === 'activity' ? Object.values(stored.transfers)
          .filter(item => item.fromAccountKey === account.accountKey || item.toAccountKey === account.accountKey || Boolean(account.walletAddress && getAddress(item.toAddress) === getAddress(account.walletAddress)))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 100)
          .map(item => ({ id: item.id, txHash: item.txHash, direction: item.fromAccountKey === account.accountKey ? 'sent' : 'received', counterpartyPocketId: item.fromAccountKey === account.accountKey ? item.toPocketId : item.fromPocketId, counterpartyAddress: item.fromAccountKey === account.accountKey ? item.toAddress : item.fromAddress, amountUsdcUnits: item.amountUsdcUnits, createdAt: item.createdAt })) : undefined
        return res.json({ ok: true, profile: { ...publicAccount(account), email: account.email }, ...(activity ? { activity } : {}) })
      }
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const action = clean(body.action, 32)
      if (action === 'register_wallet') {
        const walletAddress = clean(body.walletAddress, 42)
        if (!isAddress(walletAddress) || !identity.wallets.some(value => getAddress(value) === getAddress(walletAddress))) fail('This wallet is not verified for your HashPayStream account.', 403)
        const nextAccount = { ...account, walletAddress: getAddress(walletAddress), updatedAt: dependencies.now().toISOString() }
        await dependencies.mutate(config.storeKey, current => { const next = safeStore(current); next.accounts[account.accountKey] = nextAccount; return next })
        return res.json({ ok: true, profile: { ...publicAccount(nextAccount), email: nextAccount.email } })
      }
      if (action === 'resolve_pocket_id') {
        const requested = clean(body.pocketId, 10)
        if (!POCKET_ID.test(requested)) fail('Enter a valid 10-digit Pocket ID.', 400)
        const recipient = Object.values(stored.accounts).find(item => item.pocketId === requested)
        if (!recipient?.walletAddress) fail('This Pocket ID cannot receive Arc USDC yet.', 404)
        if (recipient.accountKey === account.accountKey) fail('Choose another Pocket ID.', 409)
        return res.json({ ok: true, recipient: publicAccount(recipient) })
      }
      if (action === 'record_transfer') {
        const txHash = clean(body.txHash, 66) as `0x${string}`
        if (!HASH.test(txHash)) fail('Transfer hash is invalid.', 400)
        if (!account.walletAddress) fail('Set up your Arc wallet before sending.', 409)
        if (stored.transfers[txHash.toLowerCase()]) return res.json({ ok: true, transfer: stored.transfers[txHash.toLowerCase()] })
        let chain: { from: string; to: string | null; input: `0x${string}`; success: boolean }
        try { chain = await dependencies.transaction(txHash, config.rpcUrl) } catch { fail('The Arc transfer is still confirming. Refresh Activity shortly.', 409) }
        if (!chain.success || !chain.to || getAddress(chain.to) !== ARC_USDC || getAddress(chain.from) !== getAddress(account.walletAddress)) fail('The confirmed transaction does not match this HashPayStream wallet.', 409)
        let decoded
        try { decoded = decodeFunctionData({ abi: transferAbi, data: chain.input }) } catch { fail('The confirmed transaction is not an Arc USDC transfer.', 409) }
        if (decoded.functionName !== 'transfer') fail('The confirmed transaction is not an Arc USDC transfer.', 409)
        const [to, amount] = decoded.args
        if (amount <= 0n) fail('The transfer amount is invalid.', 409)
        const recipient = Object.values(stored.accounts).find(item => item.walletAddress && getAddress(item.walletAddress) === getAddress(to))
        const transfer: Transfer = { id: dependencies.id(), txHash, fromAccountKey: account.accountKey, toAccountKey: recipient?.accountKey, fromPocketId: account.pocketId, toPocketId: recipient?.pocketId, fromAddress: getAddress(account.walletAddress), toAddress: getAddress(to), amountUsdcUnits: amount.toString(), createdAt: dependencies.now().toISOString() }
        await dependencies.mutate(config.storeKey, current => { const next = safeStore(current); next.transfers[txHash.toLowerCase()] ??= transfer; return next })
        return res.status(201).json({ ok: true, transfer })
      }
      fail('Account action is invalid.', 400)
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'HashPayStream accounts are temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createStreamAccountsHandler()
