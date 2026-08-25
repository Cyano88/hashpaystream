import { createHmac } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { createPublicClient, getAddress, http, isAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readDurableJson } from './durable-store.js'
import type { AgreementIntelligenceRequest } from './agreement-intelligence-schema.js'
import { signProtectionAttestation, signRepaymentCredit, type AuthoritativeArcAgreement, type UpfrontPosition } from './upfront-protection-attestation.js'

const DEFAULT_STORE_KEY = 'hashpaystream:upfront-assessments:v1'
const POSITION_ABI = [{ type: 'function', name: 'positions', stateMutability: 'view', inputs: [{ name: 'positionId', type: 'bytes32' }], outputs: [
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'protectionSigner', type: 'address' },
  { name: 'termsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
  { name: 'protectedAmount', type: 'uint256' }, { name: 'advanceAmount', type: 'uint256' }, { name: 'protectionDeadline', type: 'uint48' }, { name: 'status', type: 'uint8' },
] }] as const

type Store = { schema: 1; records: Record<string, { ownerReference: string; status: string; request?: AgreementIntelligenceRequest }> }
type AuthIdentity = { userId: string; wallets: Address[] }
type Dependencies = {
  identity: (req: Request) => Promise<AuthIdentity>; readStore: (key: string) => Promise<Store | undefined>
  agreement: (id: string, config: Config) => Promise<AuthoritativeArcAgreement>
  position: (id: Hex, config: Config) => Promise<UpfrontPosition>; env: () => NodeJS.ProcessEnv; now: () => Date
}
type Config = ReturnType<typeof configuration>

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function failure(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function address(value: unknown, label: string) { const text = clean(value, 42); if (!/^0x[a-fA-F0-9]{40}$/.test(text) || /^0x0{40}$/i.test(text)) failure(`${label} is unavailable.`, 503); return getAddress(text) }
function privateKey(value: unknown, label: string) { const text = clean(value, 66); if (!/^0x[a-fA-F0-9]{64}$/.test(text)) failure(`${label} is unavailable.`, 503); return text as Hex }

function configuration(env: NodeJS.ProcessEnv) {
  if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') failure('HashPayStream Upfront is not enabled.', 404)
  const storeKey = clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
  const apiKey = clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 200)
  const ownershipSecret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const xLayerEscrow = address(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 'X Layer escrow contract')
  const arcRouter = address(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 'Arc repayment router')
  const protectionKey = privateKey(env.HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY, 'Protection signer')
  const repaymentKey = privateKey(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY, 'Repayment signer')
  const protectionSigner = address(env.HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER, 'Protection signer address')
  const repaymentSigner = address(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER, 'Repayment signer address')
  const xLayerChainId = Number(clean(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? '1952', 20))
  if (privateKeyToAccount(protectionKey).address !== protectionSigner || privateKeyToAccount(repaymentKey).address !== repaymentSigner) failure('Upfront signer configuration does not match its private key.', 503)
  if (!storeKey || ownershipSecret.length < 32 || !apiKey.startsWith('hpl_test_') || apiKey.length < 32 || ![1952, 196].includes(xLayerChainId)) failure('HashPayStream Upfront protection is not fully configured.', 503)
  let baseUrl: URL; let rpcUrl: URL
  try { baseUrl = new URL(clean(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 240)); rpcUrl = new URL(clean(env.HASHPAYSTREAM_XLAYER_RPC_URL ?? 'https://testrpc.xlayer.tech/terigon', 240)) } catch { failure('Upfront network configuration is invalid.', 503) }
  if (baseUrl!.protocol !== 'https:' || rpcUrl!.protocol !== 'https:' || baseUrl!.username || rpcUrl!.username) failure('Upfront network configuration is invalid.', 503)
  return { storeKey, apiKey, ownershipSecret, baseUrl: baseUrl!.origin, rpcUrl: rpcUrl!.toString(), xLayerEscrow, arcRouter, protectionKey, repaymentKey, xLayerChainId }
}

async function identity(req: Request): Promise<AuthIdentity> {
  const appId = clean(process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID, 180); const appSecret = clean(process.env.PRIVY_APP_SECRET, 300)
  const token = String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
  if (!appId || !appSecret) failure('HashPayStream authentication is unavailable.', 503)
  if (!token) failure('Sign in to continue Upfront.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    if (!userId) failure('Your HashPayStream session is invalid.', 401)
    const user = await privy.users()._get(userId)
    const wallets = [...new Set(user.linked_accounts.flatMap(account => (
      account.type === 'wallet'
      && account.chain_type === 'ethereum'
      && account.wallet_client_type === 'privy'
      && account.connector_type === 'embedded'
      && isAddress(account.address)
    ) ? [getAddress(account.address)] : []))]
    return { userId, wallets }
  } catch { failure('Your HashPayStream session is invalid or expired.', 401) }
}

async function agreement(id: string, config: Config) {
  const response = await fetch(`${config.baseUrl}/api/v2/agreements?id=${encodeURIComponent(id)}`, { cache: 'no-store', headers: { 'x-api-key': config.apiKey, accept: 'application/json' } })
  const body = await response.json().catch(() => ({})) as { agreement?: AuthoritativeArcAgreement; error?: string }
  if (!response.ok || !body.agreement) failure(clean(body.error, 300) || 'Hash PayLink agreement is unavailable.', response.status || 502)
  return body.agreement
}

async function position(id: Hex, config: Config): Promise<UpfrontPosition> {
  const client = createPublicClient({ transport: http(config.rpcUrl) })
  const value = await client.readContract({ address: config.xLayerEscrow, abi: POSITION_ABI, functionName: 'positions', args: [id] })
  const [funder, repaymentRecipient, provider, , termsHash, intelligenceCommitment, , protectedAmount, advanceAmount, protectionDeadline, status] = value
  const statusName = status === 1 ? 'Funded' : status === 2 ? 'Released' : status === 3 ? 'Refunded' : failure('X Layer position is not funded.', 409)
  return { positionId: id, funder, repaymentRecipient, provider, termsHash, intelligenceCommitment, protectedAmount: protectedAmount.toString(), advanceAmount: advanceAmount.toString(), protectionDeadline: Number(protectionDeadline), status: statusName }
}

const defaults: Dependencies = { identity, readStore: key => readDurableJson<Store>(key), agreement, position, env: () => process.env, now: () => new Date() }

export function createUpfrontProtectionHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function upfrontProtection(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      const config = configuration(dependencies.env()); const auth = await dependencies.identity(req)
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const action = clean(body.action, 20); const requestId = clean(body.requestId, 100); const agreementId = clean(body.agreementId, 100); const positionId = clean(body.positionId, 66) as Hex
      if (!['release', 'repayment'].includes(action) || !/^uai_[a-zA-Z0-9]{12,80}$/.test(requestId) || !/^agr_[a-z0-9]{12,64}$/i.test(agreementId) || !/^0x[a-fA-F0-9]{64}$/.test(positionId)) failure('Upfront protection request is invalid.', 400)
      const store = await dependencies.readStore(config.storeKey)
      const record = Object.values(store?.records ?? {}).find(item => item.status === 'completed' && item.request?.requestId === requestId)
      if (!record?.request) failure('The completed Upfront assessment was not found.', 404)
      const [arcAgreement, xPosition] = await Promise.all([dependencies.agreement(agreementId, config), dependencies.position(positionId, config)])
      const ownerReference = 'hps_provider_' + createHmac('sha256', config.ownershipSecret).update('upfront\0' + auth.userId).digest('hex').slice(0, 32)
      const wallets = new Set(auth.wallets.map(wallet => wallet.toLowerCase()))
      const ownsPosition = wallets.has(xPosition.funder.toLowerCase()) || wallets.has(xPosition.repaymentRecipient.toLowerCase())
      if (record.ownerReference !== ownerReference && !ownsPosition) failure('The completed Upfront assessment was not found.', 404)
      const signed = action === 'release'
        ? await signProtectionAttestation({ request: record.request, position: xPosition, agreement: arcAgreement, arcRouter: config.arcRouter, xLayerChainId: config.xLayerChainId, xLayerEscrow: config.xLayerEscrow, privateKey: config.protectionKey, now: dependencies.now() })
        : await signRepaymentCredit({ request: record.request, position: xPosition, agreement: arcAgreement, arcRouter: config.arcRouter, privateKey: config.repaymentKey, now: dependencies.now() })
      return res.json({ ok: true, action, attestation: signed })
    } catch (error) { const status = Number((error as { status?: number }).status) || 500; return res.status(status).json({ ok: false, error: status >= 500 ? 'HashPayStream Upfront protection is temporarily unavailable.' : (error as Error).message }) }
  }
}

export default createUpfrontProtectionHandler()
