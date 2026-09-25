import { hashPayLinkArcWallet } from './hashpaylink-arc-wallet.js'
import crypto from 'node:crypto'
import { arcWalletEnvironment } from './arc-wallet-environment.js'
import { attachPocketCircleChallenge, pocketCircleReference } from './pocket-transfers.js'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { createPublicClient, encodeFunctionData, fallback, getAddress, http, isAddress, parseAbi } from 'viem'

const ARC_USDC = getAddress('0x3600000000000000000000000000000000000000')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const transferAbi = parseAbi(['function transfer(address to,uint256 amount) returns (bool)'])
const batchAbi = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const routerAdminAbi = parseAbi(['function owner() view returns (address)', 'function paused() view returns (bool)', 'function setPaused(bool shouldPause)'])
export async function readArcRouterControl(env: NodeJS.ProcessEnv) {
  const address = env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS?.trim() ?? ''
  const rpc = env.HASHPAYSTREAM_ARC_RPC_URL?.trim() || 'https://rpc.testnet.arc.network'
  if (!isAddress(address) || !rpc.startsWith('https://')) fail('Repayment router is not configured.', 503)
  const client = createPublicClient({ transport: http(rpc, { timeout: 15000, retryCount: 1 }) })
  if (await client.getChainId() !== 5042002) fail('Repayment router network mismatch.', 503)
  const [owner, paused] = await Promise.all([
    client.readContract({ address, abi: routerAdminAbi, functionName: 'owner' }),
    client.readContract({ address, abi: routerAdminAbi, functionName: 'paused' }),
  ])
  return { address: getAddress(address), owner: getAddress(owner), paused }
}
const balanceAbi = parseAbi(['function balanceOf(address owner) view returns (uint256)'])

export type CircleArcWallet = { id: string; address: string; blockchain: string; accountType?: string; state?: string }

function clean(value: unknown, max: number) { return String(value ?? '').trim().slice(0, max) }
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function bearer(req: Pick<Request, 'headers'>) { return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '' }

async function verifiedEmail(req: Request, env: NodeJS.ProcessEnv) {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) fail('HashPayStream authentication is unavailable.', 503)
  if (!token) fail('Sign in to continue.', 401)
  try {
    const client = new PrivyClient({ appId, appSecret })
    const claims = await client.utils().auth().verifyAccessToken(token)
    const user = await client.users()._get(clean(claims.user_id, 180))
    const email = user.linked_accounts.flatMap(account => account.type === 'email' ? [clean(account.address, 254).toLowerCase()] : []).find(value => EMAIL.test(value))
    if (!email) throw new Error('Verified email is unavailable.')
    return email
  } catch {
    fail('Your HashPayStream session is invalid or expired.', 401)
  }
}

function circleApiKey(env: NodeJS.ProcessEnv) {
  const profile = arcWalletEnvironment(env)
  const key = clean(profile.apiKey, 500)
  if (profile.live && /^TEST_/i.test(key)) fail('A production Circle key is required.', 503)
  if (!key) fail('Circle Arc wallet access is unavailable.', 503)
  return key
}

export async function circleJson<T extends Record<string, unknown>>(env: NodeJS.ProcessEnv, path: string, init: { method?: string; userToken?: string; body?: Record<string, unknown> } = {}) {
  if (arcWalletEnvironment(env).live) return hashPayLinkArcWallet<T>(env, path, init)
  const response = await fetch(`${clean(env.CIRCLE_BASE_URL ?? 'https://api.circle.com', 300).replace(/\/+$/, '').replace(/\/v1(?:\/w3s)?$/i, '')}${path}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${circleApiKey(env)}`,
      'x-request-id': crypto.randomUUID(),
      ...(init.userToken ? { 'x-user-token': init.userToken } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const body = await response.json().catch(() => ({})) as { data?: T; code?: number; message?: string; error?: string }
  if (!response.ok) fail(clean(body.message ?? body.error, 260) || 'Circle wallet request failed.', response.status >= 500 ? 503 : response.status)
  if (!body.data || typeof body.data !== 'object') fail('Circle wallet returned an invalid response.', 502)
  return body.data
}

export async function listCircleArcWallets(userToken: string, env: NodeJS.ProcessEnv = process.env) {
  if (!userToken || userToken.length > 8_000) fail('A valid Circle wallet session is required.', 400)
  const data = await circleJson<{ wallets?: CircleArcWallet[] }>(env, '/v1/w3s/wallets?pageSize=50', { userToken })
  return (data.wallets ?? []).filter(wallet => {
    const blockchain = clean(wallet.blockchain, 40).toUpperCase()
    const accountType = clean(wallet.accountType, 20).toUpperCase()
    const state = clean(wallet.state, 20).toUpperCase()
    return blockchain === arcWalletEnvironment(env).blockchain && accountType === 'SCA' && (!state || state === 'LIVE') && isAddress(wallet.address)
  })
}

async function readOwnedWallet(userToken: string, walletId: string, walletAddress: string, env: NodeJS.ProcessEnv) {
  const wallets = await listCircleArcWallets(userToken, env)
  const wallet = wallets.find(item => item.id === walletId && getAddress(item.address) === getAddress(walletAddress))
  if (!wallet) fail('This Circle Arc wallet is not owned by the signed-in wallet session.', 403)
  return wallet
}

export async function readArcUsdcBalance(walletAddress: string, env: NodeJS.ProcessEnv) {
  const profile = arcWalletEnvironment(env)
  const publicRpcUrl = profile.fallbackRpcUrl
  const configuredRpcUrl = clean(profile.rpcUrl, 500)
  if (!configuredRpcUrl.startsWith('https://')) fail('Arc balance access is unavailable.', 503)
  const rpcUrls = [...new Set([configuredRpcUrl, publicRpcUrl])]
  // Verify each RPC independently before allowing fallback; checking only the
  // aggregate client could validate one endpoint and read balances from another.
  const verifiedUrls: string[] = []
  for (const url of rpcUrls) {
    try { const probe = createPublicClient({ transport: http(url, { retryCount: 0, timeout: 5_000 }) }); if (await probe.getChainId() === profile.chainId) verifiedUrls.push(url) } catch { /* try the same-network fallback */ }
  }
  if (!verifiedUrls.length) fail('Arc balance network could not be verified.', 503)
  const transports = verifiedUrls.map(url => http(url, { retryCount: 1, timeout: 5_000 }))
  const client = createPublicClient({ transport: transports.length === 1 ? transports[0] : fallback(transports, { rank: false }) })
  try {
    return await client.readContract({ address: ARC_USDC, abi: balanceAbi, functionName: 'balanceOf', args: [getAddress(walletAddress)] })
  } catch {
    fail('Arc balance access is temporarily unavailable.', 503)
  }
}

export function createCircleWalletHandler(overrides: { env?: () => NodeJS.ProcessEnv; identity?: typeof verifiedEmail; balance?: typeof readArcUsdcBalance; routerControl?: typeof readArcRouterControl; attachChallenge?: typeof attachPocketCircleChallenge } = {}) {
  const environment = overrides.env ?? (() => process.env)
  const identity = overrides.identity ?? verifiedEmail
  const balance = overrides.balance ?? readArcUsdcBalance
  const routerControl = overrides.routerControl ?? readArcRouterControl
  const attachChallenge = overrides.attachChallenge ?? attachPocketCircleChallenge
  const balanceCache = new Map<string, { units: bigint; observedAt: number }>()
  return async function circleWallet(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      const env = environment()
      const email = await identity(req, env)
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const profile = arcWalletEnvironment(env)
      if (profile.live && body.walletEnvironment !== 'live') fail('Update Hash PayStream to use the production wallet.', 409)
      if (body.walletEnvironment && body.walletEnvironment !== profile.mode) fail('Wallet network does not match this app build.', 409)
      const action = clean(body.action, 40)
      if (action === 'configuration') {
        if (profile.live) {
          const hosted = await hashPayLinkArcWallet(env, '/configuration')
          if (hosted.chainId !== profile.chainId || hosted.blockchain !== profile.blockchain || !profile.appId || hosted.appId !== profile.appId) fail('Hosted wallet configuration does not match this app.', 503)
        }
        return res.json({ ok: true, environment: profile.mode, chainId: profile.chainId, blockchain: profile.blockchain, appId: profile.appId || '' })
      }
      if (profile.live && (action === 'router_status' || action === 'set_router_paused')) fail('The legacy repayment router is sandbox-only.', 409)
      const userToken = clean(body.userToken, 8_000)
      if (action === 'request_email_otp') {
        const requestedEmail = clean(body.email, 254).toLowerCase()
        const deviceId = clean(body.deviceId, 256)
        if (requestedEmail !== email || !EMAIL.test(requestedEmail) || !deviceId) fail('Circle must use your verified HashPayStream email.', 403)
        const data = await circleJson<Record<string, unknown>>(env, '/v1/w3s/users/email/token', { method: 'POST', body: { idempotencyKey: crypto.randomUUID(), deviceId, email } })
        return res.json({ ok: true, ...data })
      }
      if (action === 'refresh_session') {
        const refreshToken = clean(body.refreshToken, 8_000)
        const deviceId = clean(body.deviceId, 256)
        if (!userToken || !refreshToken || !deviceId) fail('Circle wallet session credentials are missing.', 400)
        const data = await circleJson<Record<string, unknown>>(env, '/v1/w3s/users/token/refresh', { method: 'POST', userToken, body: { idempotencyKey: crypto.randomUUID(), refreshToken, deviceId } })
        return res.json({ ok: true, ...data })
      }
      if (action === 'initialize_user') {
        if (!userToken) fail('Circle wallet session is missing.', 400)
        const data = await circleJson<Record<string, unknown>>(env, '/v1/w3s/user/initialize', { method: 'POST', userToken, body: { idempotencyKey: crypto.randomUUID(), accountType: 'SCA', blockchains: [profile.blockchain] } })
        return res.json({ ok: true, ...data })
      }
      if (action === 'create_wallet') {
        if (!userToken) fail('Circle wallet session is missing.', 400)
        const data = await circleJson<Record<string, unknown>>(env, '/v1/w3s/user/wallets', { method: 'POST', userToken, body: { idempotencyKey: crypto.randomUUID(), accountType: 'SCA', blockchains: [profile.blockchain], metadata: [{ name: 'HashPayStream Arc' }] } })
        return res.json({ ok: true, ...data })
      }
      if (action === 'receive_details') {
        if (!profile.live) fail('This receiving service requires a live Arc wallet.', 409)
        const data = await hashPayLinkArcWallet(env, '/receive', { userToken })
        return res.json({ ok: true, ...data })
      }
      if (action === 'list_wallets') {
        const wallets = await listCircleArcWallets(userToken, env)
        return res.json({ ok: true, wallets, wallet: wallets[0] ?? null })
      }
      if (action === 'get_balance') {
        const walletId = clean(body.walletId, 256)
        const walletAddress = clean(body.walletAddress, 42)
        if (!walletId || !isAddress(walletAddress)) fail('Circle wallet details are invalid.', 400)
        // ERC-20 balances are public chain data. Requiring Circle's wallet-list API
        // on every 15-second read made an otherwise healthy Arc balance depend on a
        // second upstream session call. Ownership is still enforced for every write.
        const address = getAddress(walletAddress)
        const cacheKey = `${profile.chainId}:${address.toLowerCase()}`
        let balanceUsdcUnits: bigint
        let stale = false
        try {
          balanceUsdcUnits = await balance(address, env)
          balanceCache.set(cacheKey, { units: balanceUsdcUnits, observedAt: Date.now() })
        } catch (reason) {
          const cached = balanceCache.get(cacheKey)
          if (!cached || Date.now() - cached.observedAt > 5 * 60 * 1_000) throw reason
          balanceUsdcUnits = cached.units
          stale = true
        }
        return res.json({ ok: true, walletAddress: address, balanceUsdcUnits: balanceUsdcUnits.toString(), stale })
      }
      if (action === 'router_status' || action === 'set_router_paused') {
        const control = await routerControl(env)
        if (action === 'router_status') return res.json({ ok: true, ...control })
        if (typeof body.paused !== 'boolean') fail('Choose whether to pause repayment.', 400)
        const walletId = clean(body.walletId, 256)
        const walletAddress = clean(body.walletAddress, 42)
        if (!walletId || !isAddress(walletAddress)) fail('Circle wallet details are invalid.', 400)
        const wallet = await readOwnedWallet(userToken, walletId, walletAddress, env)
        if (getAddress(wallet.address) !== control.owner) fail('Connect the repayment router owner Circle wallet.', 403)
        if (control.paused === body.paused) return res.json({ ok: true, unchanged: true, ...control })
        // Only the server-configured router pause method can be prepared here.
        // Circle still requires the wallet owner's approval before execution.
        const data = encodeFunctionData({ abi: routerAdminAbi, functionName: 'setPaused', args: [body.paused] })
        const callData = encodeFunctionData({ abi: batchAbi, functionName: 'executeBatch', args: [[{ target: control.address, value: 0n, data }]] })
        const challenge = await circleJson<Record<string, unknown>>(env, '/v1/w3s/user/transactions/contractExecution', { method: 'POST', userToken, body: { idempotencyKey: crypto.randomUUID(), walletId: wallet.id, feeLevel: 'HIGH', refId: 'hashpaystream-router-pause', contractAddress: getAddress(wallet.address), callData } })
        return res.json({ ok: true, ...challenge })
      }
      if (action === 'send_usdc') {
        const suppliedKey = clean(body.idempotencyKey, 80)
        if (suppliedKey && !UUID.test(suppliedKey)) fail('Payment retry key is invalid.', 400)
        const walletId = clean(body.walletId, 256)
        const walletAddress = clean(body.walletAddress, 42)
        const recipient = clean(body.recipient, 42)
        const amountUnits = clean(body.amountUnits, 80)
        if (!walletId || !isAddress(walletAddress) || !isAddress(recipient) || !/^\d+$/.test(amountUnits) || BigInt(amountUnits) <= 0n) fail('Circle payment details are invalid.', 400)
        const wallet = await readOwnedWallet(userToken, walletId, walletAddress, env)
        const transfer = encodeFunctionData({ abi: transferAbi, functionName: 'transfer', args: [getAddress(recipient), BigInt(amountUnits)] })
        const callData = encodeFunctionData({ abi: batchAbi, functionName: 'executeBatch', args: [[{ target: ARC_USDC, value: 0n, data: transfer }]] })
        const data = await circleJson<Record<string, unknown>>(env, '/v1/w3s/user/transactions/contractExecution', { method: 'POST', userToken, body: { idempotencyKey: suppliedKey || crypto.randomUUID(), walletId: wallet.id, feeLevel: 'HIGH', refId: suppliedKey ? await pocketCircleReference(email, suppliedKey) : 'hashpaystream-arc-send', contractAddress: getAddress(wallet.address), callData } })
        if (suppliedKey && typeof data.challengeId === 'string') await attachChallenge(email, suppliedKey, wallet.address, recipient, amountUnits, data.challengeId, wallet.id)
        return res.json({ ok: true, ...data })
      }
      if (action === 'get_challenge') {
        const challengeId = clean(body.challengeId, 80)
        if (!userToken || !UUID.test(challengeId)) fail('Circle approval reference is invalid.', 400)
        const data = await circleJson<Record<string, unknown>>(env, `/v1/w3s/user/challenges/${encodeURIComponent(challengeId)}`, { userToken })
        return res.json({ ok: true, ...data })
      }
      if (action === 'get_transaction') {
        const transactionId = clean(body.transactionId, 80)
        if (!userToken || !UUID.test(transactionId)) fail('Circle transaction reference is invalid.', 400)
        const data = await circleJson<Record<string, unknown>>(env, `/v1/w3s/transactions/${encodeURIComponent(transactionId)}`, { userToken })
        return res.json({ ok: true, ...data })
      }
      fail('Circle wallet action is invalid.', 400)
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Circle Arc wallet is temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createCircleWalletHandler()
