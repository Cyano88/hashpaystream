import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { createPublicClient, getAddress, hashTypedData, http, isAddress, type Address, type Hex } from 'viem'
import { readDurableJson } from './durable-store.js'
import type { UpfrontAssessmentStore } from './upfront-assessment.js'
import { fundingPartnerAccountKey, type FundingPartnerStore } from './funding-partners.js'

const DEFAULT_STORE_KEY = 'hashpaystream:upfront-assessments:v1'
const DEFAULT_PARTNER_STORE_KEY = 'hashpaystream:funding-partners:v1'

type Dependencies = {
  identityEmails: (req: Request, env: NodeJS.ProcessEnv) => Promise<string[]>
  readStore: (key: string) => Promise<UpfrontAssessmentStore | undefined>
  readPartners: (key: string) => Promise<FundingPartnerStore | undefined>
  position: (id: Hex, config: ChainConfig) => Promise<PositionState>
  env: () => NodeJS.ProcessEnv
  now: () => Date
}

type ChainConfig = { rpcUrl: string; escrow: Address; chainId: number }
type PositionState = { funder: Address; repaymentRecipient: Address; status: 'available' | 'funded' | 'released' | 'refunded' }

const POSITION_ABI = [{ type: 'function', name: 'positions', stateMutability: 'view', inputs: [{ name: 'positionId', type: 'bytes32' }], outputs: [
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'protectionSigner', type: 'address' },
  { name: 'termsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
  { name: 'protectedAmount', type: 'uint256' }, { name: 'advanceAmount', type: 'uint256' }, { name: 'protectionDeadline', type: 'uint48' }, { name: 'status', type: 'uint8' },
] }] as const

const OFFER_TYPES = { UnderwritingOffer: [
  { name: 'provider', type: 'address' }, { name: 'termsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' },
  { name: 'protectedAmount', type: 'uint256' }, { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
  { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] } as const

function clean(value: unknown, maximum: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function failure(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

function bearer(req: Pick<Request, 'headers'>) {
  return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

function funderEmails(env: NodeJS.ProcessEnv) {
  return new Set([
    ...String(env.HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS ?? '').split(','),
    ...String(env.HASHPAYSTREAM_UPFRONT_FUNDER_WALLETS ?? '').split(','),
  ]
    .map(value => value.trim().toLowerCase())
    .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^0x[a-f0-9]{40}$/.test(value)))
}

async function verifiedIdentityEmails(req: Request, env: NodeJS.ProcessEnv) {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) failure('HashPayStream authentication is unavailable.', 503)
  if (!token) failure('Sign in with an approved funder account.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    if (!userId) throw new Error('Privy identity is empty.')
    const user = await privy.users()._get(userId)
    return user.linked_accounts.flatMap(account => {
      if (account.type !== 'email' && account.type !== 'wallet') return []
      const address = String(account.address ?? '').trim().toLowerCase()
      return address ? [address] : []
    })
  } catch (cause) {
    throw Object.assign(failure('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function chainConfiguration(env: NodeJS.ProcessEnv): ChainConfig {
  const rpcUrl = clean(env.HASHPAYSTREAM_XLAYER_RPC_URL, 240)
  const escrowText = clean(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const chainId = Number(clean(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID, 20))
  let parsed: URL
  try { parsed = new URL(rpcUrl) } catch { failure('The X Layer funding network is unavailable.', 503) }
  if (parsed!.protocol !== 'https:' || parsed!.username || parsed!.password || !isAddress(escrowText) || ![1952, 196].includes(chainId)) failure('The X Layer funding network is unavailable.', 503)
  return { rpcUrl: parsed!.toString(), escrow: getAddress(escrowText), chainId }
}

function opportunity(record: UpfrontAssessmentStore['records'][string], now: Date, config: ChainConfig) {
  if (record.status !== 'completed' || !record.agreementId || record.request?.agreement.state !== 'funded') return undefined
  const response = record.response && typeof record.response === 'object' ? record.response : {}
  const intelligence = response.intelligence && typeof response.intelligence === 'object' ? response.intelligence as Record<string, unknown> : {}
  const decision = response.decision && typeof response.decision === 'object' ? response.decision as Record<string, unknown> : {}
  const offer = decision.onchainOffer && typeof decision.onchainOffer === 'object' ? decision.onchainOffer as Record<string, unknown> : undefined
  const expiresAt = clean(decision.expiresAt, 64)
  if (decision.decision !== 'APPROVE' || !offer || !Number.isFinite(Date.parse(expiresAt))) return undefined
  const domain = offer.domain && typeof offer.domain === 'object' ? offer.domain as Record<string, unknown> : undefined
  const message = offer.message && typeof offer.message === 'object' ? offer.message as Record<string, unknown> : undefined
  if (
    offer.primaryType !== 'UnderwritingOffer' || !domain || !message
    || domain.name !== 'HashPayStream Upfront' || domain.version !== '1' || Number(domain.chainId) !== config.chainId
    || !isAddress(String(domain.verifyingContract ?? '')) || getAddress(String(domain.verifyingContract)) !== config.escrow
    || !isAddress(String(message.provider ?? '')) || !/^0x[a-fA-F0-9]{64}$/.test(String(message.termsHash ?? ''))
    || !/^0x[a-fA-F0-9]{64}$/.test(String(message.intelligenceCommitment ?? '')) || !/^0x[a-fA-F0-9]{64}$/.test(String(message.nonce ?? ''))
  ) return undefined
  const protectedUnits = clean(record.request.agreement.amountUsdcUnits, 32)
  const requestedUnits = clean(record.request.advance.requestedUsdcUnits, 32)
  const maximumAdvanceBps = Number(decision.maximumAdvanceBps)
  if (
    !/^\d+$/.test(protectedUnits) || !/^\d+$/.test(requestedUnits) || !/^\d+$/.test(String(message.protectedAmount ?? ''))
    || !Number.isInteger(maximumAdvanceBps) || maximumAdvanceBps < 1 || maximumAdvanceBps > 10_000
    || getAddress(String(message.provider)) !== getAddress(record.request.advance.providerPayoutAddress)
    || String(message.protectedAmount) !== protectedUnits || Number(message.maxAdvanceBps) !== maximumAdvanceBps
  ) return undefined
  const policyMaximum = BigInt(protectedUnits) * BigInt(maximumAdvanceBps) / 10_000n
  const fundableUnits = BigInt(requestedUnits) < policyMaximum ? BigInt(requestedUnits) : policyMaximum
  if (fundableUnits <= 0n) return undefined
  const offerMessage = {
    provider: getAddress(String(message.provider)), termsHash: message.termsHash as Hex, intelligenceCommitment: message.intelligenceCommitment as Hex,
    protectedAmount: BigInt(String(message.protectedAmount)), maxAdvanceBps: Number(message.maxAdvanceBps),
    protectionDeadline: Number(message.protectionDeadline), underwritingDeadline: Number(message.underwritingDeadline), nonce: message.nonce as Hex,
  }
  if (!Number.isInteger(offerMessage.maxAdvanceBps) || !Number.isSafeInteger(offerMessage.protectionDeadline) || !Number.isSafeInteger(offerMessage.underwritingDeadline)) return undefined
  const positionId = hashTypedData({ domain: { name: 'HashPayStream Upfront', version: '1', chainId: config.chainId, verifyingContract: config.escrow }, types: OFFER_TYPES, primaryType: 'UnderwritingOffer', message: offerMessage })
  return {
    id: record.request.requestId,
    agreementId: record.agreementId,
    title: record.request.agreement.title,
    protectedUsdcUnits: protectedUnits,
    requestedAdvanceUsdcUnits: fundableUnits.toString(),
    maximumAdvanceBps,
    durationSeconds: record.request.agreement.durationSeconds,
    providerPayoutAddress: record.request.advance.providerPayoutAddress,
    evidenceGrade: clean(intelligence.evidenceGrade, 24),
    confidence: Number(intelligence.confidence),
    expiresAt,
    live: Date.parse(expiresAt) > now.getTime(),
    positionId,
    onchainOffer: offer,
  }
}

async function position(id: Hex, config: ChainConfig): Promise<PositionState> {
  const value = await createPublicClient({ transport: http(config.rpcUrl) }).readContract({ address: config.escrow, abi: POSITION_ABI, functionName: 'positions', args: [id] })
  const status = value[10] === 1 ? 'funded' : value[10] === 2 ? 'released' : value[10] === 3 ? 'refunded' : 'available'
  return { funder: getAddress(value[0]), repaymentRecipient: getAddress(value[1]), status }
}

const defaults: Dependencies = {
  identityEmails: verifiedIdentityEmails,
  readStore: key => readDurableJson<UpfrontAssessmentStore>(key),
  readPartners: key => readDurableJson<FundingPartnerStore>(key),
  position,
  env: () => process.env,
  now: () => new Date(),
}

export function createUpfrontOpportunitiesHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function upfrontOpportunities(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      const env = dependencies.env()
      if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') failure('HashPayStream Upfront is not enabled.', 404)
      const allowed = funderEmails(env)
      const emails = await dependencies.identityEmails(req, env)
      let approved = emails.some(email => allowed.has(email))
      const ownershipSecret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
      if (!approved && ownershipSecret.length >= 32) {
        const partnerStoreKey = clean(env.HASHPAYSTREAM_FUNDING_PARTNER_STORE_KEY ?? DEFAULT_PARTNER_STORE_KEY, 160)
        const partnerStore = await dependencies.readPartners(partnerStoreKey)
        const approvedKeys = new Set(Object.values(partnerStore?.applications ?? {}).filter(item => item.status === 'approved').map(item => item.accountKey))
        approved = emails.some(email => approvedKeys.has(fundingPartnerAccountKey(ownershipSecret, email)))
      }
      if (!approved) failure('This HashPayStream account is not approved to fund opportunities.', 403)
      const chain = chainConfiguration(env)
      const callerWallets = new Set(emails.filter(value => isAddress(value)).map(value => getAddress(value).toLowerCase()))
      const storeKey = clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
      if (!storeKey) failure('The Upfront opportunity store is unavailable.', 503)
      const store = await dependencies.readStore(storeKey)
      const candidates = Object.values(store?.records ?? {}).flatMap(record => opportunity(record, dependencies.now(), chain) ?? [])
      const inspected = await Promise.all(candidates.map(async candidate => ({ candidate, position: await dependencies.position(candidate.positionId, chain) })))
      const opportunities: Array<(typeof candidates)[number] & { positionStatus: PositionState['status']; funder?: Address; repaymentRecipient?: Address }> = []
      for (const { candidate, position } of inspected) {
        if (position.status === 'available') {
          if (candidate.live) opportunities.push({ ...candidate, positionStatus: position.status })
          continue
        }
        const ownsPosition = callerWallets.has(position.funder.toLowerCase()) || callerWallets.has(position.repaymentRecipient.toLowerCase())
        if (ownsPosition) opportunities.push({ ...candidate, positionStatus: position.status, funder: position.funder, repaymentRecipient: position.repaymentRecipient })
      }
      opportunities.sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
      return res.json({ ok: true, opportunities })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'The private Upfront funding desk is temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createUpfrontOpportunitiesHandler()
