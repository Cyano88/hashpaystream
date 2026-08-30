import { createHmac } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { createPublicClient, getAddress, hashTypedData, http, isAddress, keccak256, recoverTypedDataAddress, toBytes, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mutateDurableJson, readDurableJson } from './durable-store.js'
import type { UpfrontAssessmentRecord, UpfrontAssessmentStore } from './upfront-assessment.js'
import { fundingPartnerAccountKey, type FundingPartnerRecord, type FundingPartnerStore } from './funding-partners.js'
import { hasMinimumUpfrontProtectionWindow, minimumUpfrontRemainingSeconds } from './early-pay-timing-policy.js'
import { FUNDING_TERMS_TYPES, signFundingTerms, type SignedFundingTerms } from './upfront-funding-terms.js'
import { requireUpfrontSettlementV3 } from './upfront-v3.js'

const DEFAULT_STORE_KEY = 'hashpaystream:upfront-assessments:v1'
const DEFAULT_PARTNER_STORE_KEY = 'hashpaystream:funding-partners:v1'
const REQUEST_ID = /^uai_[a-zA-Z0-9]{12,80}$/
const NATIVE_XLAYER_USDC = getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061')

type Identity = { userId: string; emails: string[]; wallets: Address[] }
type ChainConfig = { rpcUrl: string; escrow: Address; chainId: number; arcRpcUrl: string; arcRouter: Address }
type TermsConfig = { privateKey: Hex; signer: Address; treasury: Address }
type PositionState = { funder: Address; repaymentRecipient: Address; status: 'available' | 'funded' | 'released' | 'settled' | 'refunded' }
type Capacity = { balance: bigint; allowed: boolean }
type Dependencies = {
  identity: (req: Request, env: NodeJS.ProcessEnv) => Promise<Identity>
  readStore: (key: string) => Promise<UpfrontAssessmentStore | undefined>
  mutateStore: (key: string, update: (current: UpfrontAssessmentStore | undefined) => UpfrontAssessmentStore | Promise<UpfrontAssessmentStore>) => Promise<UpfrontAssessmentStore>
  readPartners: (key: string) => Promise<FundingPartnerStore | undefined>
  position: (id: Hex, config: ChainConfig) => Promise<PositionState>
  capacity: (wallet: Address, config: ChainConfig) => Promise<Capacity>
  env: () => NodeJS.ProcessEnv
  now: () => Date
}

const POSITION_ABI = [{ type: 'function', name: 'positions', stateMutability: 'view', inputs: [{ name: 'positionId', type: 'bytes32' }], outputs: [
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' }, { name: 'provider', type: 'address' },
  { name: 'providerArcRecipient', type: 'address' }, { name: 'platformTreasury', type: 'address' }, { name: 'protectionSigner', type: 'address' },
  { name: 'termsHash', type: 'bytes32' }, { name: 'fundingTermsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' },
  { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' }, { name: 'advanceAmount', type: 'uint256' },
  { name: 'funderRepaymentAmount', type: 'uint256' }, { name: 'platformFeeAmount', type: 'uint256' }, { name: 'protectionDeadline', type: 'uint48' }, { name: 'status', type: 'uint8' },
] }] as const
const ESCROW_ABI = [{ type: 'function', name: 'allowedFunders', stateMutability: 'view', inputs: [{ name: 'funder', type: 'address' }], outputs: [{ type: 'bool' }] }] as const
const ROUTER_ABI = [{ type: 'function', name: 'settledAgreements', stateMutability: 'view', inputs: [{ name: 'arcAgreementHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] }] as const
const ERC20_ABI = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const
const OFFER_TYPES = { UnderwritingOffer: [
  { name: 'provider', type: 'address' }, { name: 'termsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' },
  { name: 'protectedAmount', type: 'uint256' }, { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
  { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] } as const

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function failure(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function bearer(req: Pick<Request, 'headers'>) { return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '' }
function safeStore(value?: UpfrontAssessmentStore): UpfrontAssessmentStore { return { schema: 1, records: value?.schema === 1 && value.records ? { ...value.records } : {} } }
function providerReference(secret: string, userId: string) { return 'hps_provider_' + createHmac('sha256', secret).update('upfront\0' + userId).digest('hex').slice(0, 32) }

async function verifiedIdentity(req: Request, env: NodeJS.ProcessEnv): Promise<Identity> {
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) failure('HashPayStream authentication is unavailable.', 503)
  if (!token) failure('Sign in to continue.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret })
    const claims = await privy.utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    const user = await privy.users()._get(userId)
    const emails = [...new Set(user.linked_accounts.flatMap(account => account.type === 'email' ? [clean(account.address, 254).toLowerCase()] : []).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
    const wallets = [...new Set(user.linked_accounts.flatMap(account => account.type === 'wallet' && account.chain_type === 'ethereum' && account.wallet_client_type === 'privy' && account.connector_type === 'embedded' && isAddress(account.address) ? [getAddress(account.address)] : []))]
    if (!userId || !emails.length) throw new Error('Verified identity is incomplete.')
    return { userId, emails, wallets }
  } catch (cause) {
    throw Object.assign(failure('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function chainConfiguration(env: NodeJS.ProcessEnv): ChainConfig {
  const rpcUrl = clean(env.HASHPAYSTREAM_XLAYER_RPC_URL, 240)
  const arcRpcUrl = clean(env.HASHPAYSTREAM_ARC_RPC_URL ?? 'https://rpc.testnet.arc.network', 240)
  const escrowText = clean(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const arcRouterText = clean(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 42)
  const chainId = Number(clean(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID, 20))
  let parsed: URL; let parsedArc: URL
  try { parsed = new URL(rpcUrl); parsedArc = new URL(arcRpcUrl) } catch { failure('The funding networks are unavailable.', 503) }
  if (parsed!.protocol !== 'https:' || parsedArc!.protocol !== 'https:' || parsed!.username || parsed!.password || parsedArc!.username || parsedArc!.password || !isAddress(escrowText) || !isAddress(arcRouterText) || ![1952, 196].includes(chainId)) failure('The funding networks are unavailable.', 503)
  return { rpcUrl: parsed!.toString(), escrow: getAddress(escrowText), chainId, arcRpcUrl: parsedArc!.toString(), arcRouter: getAddress(arcRouterText) }
}

function termsConfiguration(env: NodeJS.ProcessEnv): TermsConfig {
  const privateKey = clean(env.HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY, 66)
  const signer = clean(env.HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER, 42)
  const treasury = clean(env.HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS, 42)
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey) || !isAddress(signer) || !isAddress(treasury)) failure('Funding terms are not configured.', 503)
  const account = privateKeyToAccount(privateKey as Hex)
  if (account.address !== getAddress(signer)) failure('Funding terms signer does not match its private key.', 503)
  return { privateKey: privateKey as Hex, signer: account.address, treasury: getAddress(treasury) }
}

function opportunity(record: UpfrontAssessmentRecord, now: Date, config: ChainConfig, minimumRemainingSeconds: number, includeExpired = false) {
  if (record.status !== 'completed' || !record.agreementId || record.request?.agreement.state !== 'funded') return undefined
  const response = record.response && typeof record.response === 'object' ? record.response : {}
  const intelligence = response.intelligence && typeof response.intelligence === 'object' ? response.intelligence as Record<string, unknown> : {}
  const decision = response.decision && typeof response.decision === 'object' ? response.decision as Record<string, unknown> : {}
  const offer = decision.onchainOffer && typeof decision.onchainOffer === 'object' ? decision.onchainOffer as Record<string, unknown> : undefined
  const expiresAt = clean(decision.expiresAt, 64)
  if (decision.decision !== 'APPROVE' || !offer || !Number.isFinite(Date.parse(expiresAt))) return undefined
  const domain = offer.domain && typeof offer.domain === 'object' ? offer.domain as Record<string, unknown> : undefined
  const message = offer.message && typeof offer.message === 'object' ? offer.message as Record<string, unknown> : undefined
  if (offer.primaryType !== 'UnderwritingOffer' || !domain || !message || domain.name !== 'HashPayStream Upfront' || domain.version !== '1' || Number(domain.chainId) !== config.chainId || !isAddress(String(domain.verifyingContract ?? '')) || getAddress(String(domain.verifyingContract)) !== config.escrow || !isAddress(String(message.provider ?? '')) || !/^0x[a-fA-F0-9]{64}$/.test(String(message.termsHash ?? '')) || !/^0x[a-fA-F0-9]{64}$/.test(String(message.intelligenceCommitment ?? '')) || !/^0x[a-fA-F0-9]{64}$/.test(String(message.nonce ?? ''))) return undefined
  const protectedUnits = clean(record.request.agreement.amountUsdcUnits, 32)
  const requestedUnits = clean(record.request.advance.requestedUsdcUnits, 32)
  const maximumAdvanceBps = Number(decision.maximumAdvanceBps)
  if (!/^\d+$/.test(protectedUnits) || !/^\d+$/.test(requestedUnits) || !/^\d+$/.test(String(message.protectedAmount ?? '')) || !Number.isInteger(maximumAdvanceBps) || maximumAdvanceBps < 1 || maximumAdvanceBps > 10_000 || getAddress(String(message.provider)) !== getAddress(record.request.advance.providerPayoutAddress) || String(message.protectedAmount) !== protectedUnits || Number(message.maxAdvanceBps) !== maximumAdvanceBps) return undefined
  const policyMaximum = BigInt(protectedUnits) * BigInt(maximumAdvanceBps) / 10_000n
  const fundableUnits = BigInt(requestedUnits) < policyMaximum ? BigInt(requestedUnits) : policyMaximum
  if (fundableUnits <= 0n) return undefined
  const expiresAtSeconds = Math.floor(Date.parse(expiresAt) / 1000)
  const offerMessage = { provider: getAddress(String(message.provider)), termsHash: message.termsHash as Hex, intelligenceCommitment: message.intelligenceCommitment as Hex, protectedAmount: BigInt(String(message.protectedAmount)), maxAdvanceBps: Number(message.maxAdvanceBps), protectionDeadline: Number(message.protectionDeadline), underwritingDeadline: Number(message.underwritingDeadline), nonce: message.nonce as Hex }
  if (!Number.isInteger(offerMessage.maxAdvanceBps) || !Number.isSafeInteger(offerMessage.protectionDeadline) || offerMessage.protectionDeadline !== record.request.agreement.protectionDeadline || !Number.isSafeInteger(offerMessage.underwritingDeadline) || offerMessage.protectionDeadline <= offerMessage.underwritingDeadline || offerMessage.underwritingDeadline !== expiresAtSeconds) return undefined
  const live = offerMessage.underwritingDeadline > Math.floor(now.getTime() / 1000) && hasMinimumUpfrontProtectionWindow(offerMessage.protectionDeadline, now, minimumRemainingSeconds)
  if (!includeExpired && !live) return undefined
  const positionId = hashTypedData({ domain: { name: 'HashPayStream Upfront', version: '1', chainId: config.chainId, verifyingContract: config.escrow }, types: OFFER_TYPES, primaryType: 'UnderwritingOffer', message: offerMessage })
  return { id: record.request.requestId, agreementId: record.agreementId, title: record.request.agreement.title, protectedUsdcUnits: protectedUnits, requestedAdvanceUsdcUnits: fundableUnits.toString(), maximumAdvanceBps, durationSeconds: record.request.agreement.durationSeconds, providerPayoutAddress: record.request.advance.providerPayoutAddress, evidenceGrade: clean(intelligence.evidenceGrade, 24), confidence: Number(intelligence.confidence), expiresAt, live, positionId, onchainOffer: offer }
}

async function position(id: Hex, config: ChainConfig): Promise<PositionState> {
  const value = await createPublicClient({ transport: http(config.rpcUrl) }).readContract({ address: config.escrow, abi: POSITION_ABI, functionName: 'positions', args: [id] })
  let status: PositionState['status'] = value[15] === 1 ? 'funded' : value[15] === 2 ? 'released' : value[15] === 3 ? 'refunded' : 'available'
  const arcAgreementHash = value[9]
  if (status === 'released' && arcAgreementHash !== `0x${'0'.repeat(64)}`) {
    try {
      const settled = await createPublicClient({ transport: http(config.arcRpcUrl) }).readContract({ address: config.arcRouter, abi: ROUTER_ABI, functionName: 'settledAgreements', args: [arcAgreementHash] })
      if (settled) status = 'settled'
    } catch {
      // Keep the recoverable X Layer state when Arc RPC is temporarily unavailable.
    }
  }
  return { funder: getAddress(value[0]), repaymentRecipient: getAddress(value[1]), status }
}
async function capacity(wallet: Address, config: ChainConfig): Promise<Capacity> {
  const client = createPublicClient({ transport: http(config.rpcUrl) })
  const [balance, allowed] = await Promise.all([
    client.readContract({ address: NATIVE_XLAYER_USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] }),
    client.readContract({ address: config.escrow, abi: ESCROW_ABI, functionName: 'allowedFunders', args: [wallet] }),
  ])
  return { balance, allowed }
}

const defaults: Dependencies = {
  identity: verifiedIdentity,
  readStore: key => readDurableJson<UpfrontAssessmentStore>(key),
  mutateStore: (key, update) => mutateDurableJson<UpfrontAssessmentStore>(key, update),
  readPartners: key => readDurableJson<FundingPartnerStore>(key),
  position, capacity, env: () => process.env, now: () => new Date(),
}

function approvedPartner(identity: Identity, partners: FundingPartnerStore | undefined, secret: string) {
  const keys = new Set(identity.emails.map(email => fundingPartnerAccountKey(secret, email)))
  return Object.values(partners?.applications ?? {}).find(item => item.status === 'approved' && keys.has(item.accountKey))
}
function partnerWallet(record: FundingPartnerRecord | undefined) {
  return record?.walletAddress && isAddress(record.walletAddress) ? getAddress(record.walletAddress) : undefined
}
function findRecord(store: UpfrontAssessmentStore, requestId: string) {
  return Object.entries(store.records).find(([, record]) => record.request?.requestId === requestId)
}

async function signedTerms(input: {
  candidate: NonNullable<ReturnType<typeof opportunity>>
  record: UpfrontAssessmentRecord
  partnerWallet: Address
  advanceAmount: bigint
  chain: ChainConfig
  terms: TermsConfig
}) {
  if (!input.record.request || !isAddress(input.record.request.settlement.providerRecipient)) failure('Provider settlement wallet is unavailable.', 409)
  const deadline = Math.floor(Date.parse(input.candidate.expiresAt) / 1000)
  return signFundingTerms({
    offerHash: input.candidate.positionId,
    funder: input.partnerWallet,
    providerArcRecipient: getAddress(input.record.request.settlement.providerRecipient),
    platformTreasury: input.terms.treasury,
    advanceAmount: input.advanceAmount,
    protectedAmount: BigInt(input.candidate.protectedUsdcUnits),
    durationSeconds: input.candidate.durationSeconds,
    deadline,
    nonce: keccak256(toBytes(`hashpaystream.funding-terms\0${input.candidate.id}\0${input.partnerWallet}\0${input.advanceAmount}`)),
    chainId: input.chain.chainId,
    escrow: input.chain.escrow,
    privateKey: input.terms.privateKey,
  })
}

async function reservedUnits(store: UpfrontAssessmentStore, partnerId: string, omitRequestId: string, now: Date, chain: ChainConfig, minimumRemainingSeconds: number, dependencies: Dependencies) {
  const pending: Array<{ request: NonNullable<UpfrontAssessmentRecord['fundingRequest']>; candidate: NonNullable<ReturnType<typeof opportunity>> }> = []
  for (const record of Object.values(store.records)) {
    const request = record.fundingRequest
    const candidate = opportunity(record, now, chain, minimumRemainingSeconds)
    if (request?.settlementVersion === 3 && request.status === 'pending' && request.fundingTerms && request.providerSignature && request.partnerApplicationId === partnerId && candidate && candidate.id !== omitRequestId && candidate.live) pending.push({ request, candidate })
  }
  const inspected = await Promise.all(pending.map(async item => ({ ...item, position: await dependencies.position(item.candidate.positionId, chain) })))
  return inspected.reduce((total, item) => total + (item.position.status === 'available' ? BigInt(item.request.advanceUsdcUnits) : 0n), 0n)
}

export function createUpfrontOpportunitiesHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function upfrontOpportunities(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      const env = dependencies.env()
      if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') failure('HashPayStream Upfront is not enabled.', 404)
      requireUpfrontSettlementV3(env)
      const secret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
      if (secret.length < 32) failure('Private funding matching is unavailable.', 503)
      const identity = await dependencies.identity(req, env)
      const chain = chainConfiguration(env)
      const terms = termsConfiguration(env)
      const now = dependencies.now()
      const minimumRemainingSeconds = minimumUpfrontRemainingSeconds(env)
      const storeKey = clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
      const partnerStoreKey = clean(env.HASHPAYSTREAM_FUNDING_PARTNER_STORE_KEY ?? DEFAULT_PARTNER_STORE_KEY, 160)
      const [storeValue, partners] = await Promise.all([dependencies.readStore(storeKey), dependencies.readPartners(partnerStoreKey)])
      const store = safeStore(storeValue)
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const view = clean(req.query?.view, 24)

      if (view === 'partners' || (req.method === 'POST' && clean(body.action, 24) === 'select_partner')) {
        const requestId = clean(req.method === 'GET' ? req.query?.requestId : body.requestId, 100)
        if (!REQUEST_ID.test(requestId)) failure('Early-pay request is invalid.', 400)
        const found = findRecord(store, requestId)
        if (!found || found[1].ownerReference !== providerReference(secret, identity.userId)) failure('Early-pay request was not found.', 404)
        const candidate = opportunity(found[1], now, chain, minimumRemainingSeconds, Boolean(found[1].fundingRequest))
        if (!candidate) failure('This early-pay request is no longer available.', 409)
        const positionState = await dependencies.position(candidate.positionId, chain)
        const selectedProfile = found[1].fundingRequest ? partners?.applications?.[found[1].fundingRequest.partnerApplicationId] : undefined
        const selected = found[1].fundingRequest ? {
          partnerId: found[1].fundingRequest.partnerApplicationId,
          partnerName: selectedProfile?.name || 'Funding partner',
          advanceUsdcUnits: found[1].fundingRequest.advanceUsdcUnits,
          quote: found[1].fundingRequest.fundingTerms?.quote,
          status: positionState.status !== 'available' ? positionState.status : !candidate.live || found[1].fundingRequest.settlementVersion !== 3 || !found[1].fundingRequest.fundingTerms || !found[1].fundingRequest.providerSignature ? 'expired' : found[1].fundingRequest.status,
        } : undefined
        if (req.method === 'GET') {
          if (selected?.status === 'pending' || selected?.status === 'funded' || selected?.status === 'released') return res.json({ ok: true, partners: [], selection: selected })
          if (!candidate.live || positionState.status !== 'available') return res.json({ ok: true, partners: [], selection: selected })
          const approved = Object.values(partners?.applications ?? {}).filter(item => item.status === 'approved' && partnerWallet(item))
          const options = await Promise.all(approved.map(async item => {
            try {
              const wallet = partnerWallet(item)!
              const [{ balance, allowed }, reserved] = await Promise.all([dependencies.capacity(wallet, chain), reservedUnits(store, item.id, requestId, now, chain, minimumRemainingSeconds, dependencies)])
              const available = balance > reserved ? balance - reserved : 0n
              const maximum = available < BigInt(candidate.requestedAdvanceUsdcUnits) ? available : BigInt(candidate.requestedAdvanceUsdcUnits)
              if (!allowed || maximum <= 0n) return undefined
              const fundingTerms = await signedTerms({ candidate, record: found[1], partnerWallet: wallet, advanceAmount: maximum, chain, terms })
              return { id: item.id, name: item.name, maximumRequestUsdcUnits: maximum.toString(), canCoverFullRequest: maximum >= BigInt(candidate.requestedAdvanceUsdcUnits), fundingTerms }
            } catch {
              return undefined
            }
          }))
          return res.json({ ok: true, partners: options.filter(Boolean), selection: selected })
        }

        if (!candidate.live || positionState.status !== 'available') failure('This early-pay request can no longer be assigned.', 409)
        const partnerId = clean(body.partnerId, 64)
        const partner = partners?.applications?.[partnerId]
        const wallet = partnerWallet(partner)
        if (!partner || partner.status !== 'approved' || !wallet) failure('Choose an available funding partner.', 400)
        const requestedText = clean(body.advanceUsdcUnits, 32)
        if (!/^[1-9]\d*$/.test(requestedText)) failure('Choose a valid early-pay amount.', 400)
        const requested = BigInt(requestedText)
        const providerSignature = clean(body.providerSignature, 132)
        if (!/^0x[a-fA-F0-9]{130}$/.test(providerSignature)) failure('Accept the exact funding terms with your payout wallet.', 400)
        let selectedRecord!: UpfrontAssessmentRecord
        await dependencies.mutateStore(storeKey, async current => {
          const next = safeStore(current)
          const currentFound = findRecord(next, requestId)
          if (!currentFound || currentFound[1].ownerReference !== found[1].ownerReference) failure('Early-pay request changed before assignment.', 409)
          const currentCandidate = opportunity(currentFound[1], now, chain, minimumRemainingSeconds)
          if (!currentCandidate?.live || (await dependencies.position(currentCandidate.positionId, chain)).status !== 'available') failure('This early-pay request can no longer be assigned.', 409)
          if (currentFound[1].fundingRequest?.settlementVersion === 3 && currentFound[1].fundingRequest.status === 'pending' && currentFound[1].fundingRequest.fundingTerms && currentFound[1].fundingRequest.providerSignature && new Date(currentFound[1].fundingRequest.expiresAt).getTime() > now.getTime()) failure('This early-pay request already has a funding partner.', 409)
          const [{ balance, allowed }, reserved] = await Promise.all([dependencies.capacity(wallet, chain), reservedUnits(next, partner.id, requestId, now, chain, minimumRemainingSeconds, dependencies)])
          const available = balance > reserved ? balance - reserved : 0n
          if (!allowed || requested > available || requested > BigInt(currentCandidate.requestedAdvanceUsdcUnits)) failure('This partner cannot cover that early-pay amount.', 409)
          const fundingTerms = await signedTerms({ candidate: currentCandidate, record: currentFound[1], partnerWallet: wallet, advanceAmount: requested, chain, terms })
          const recoveredProvider = await recoverTypedDataAddress({
            domain: fundingTerms.domain,
            types: FUNDING_TERMS_TYPES,
            primaryType: 'FundingTerms',
            message: {
              ...fundingTerms.message,
              advanceAmount: BigInt(fundingTerms.message.advanceAmount),
              funderRepaymentAmount: BigInt(fundingTerms.message.funderRepaymentAmount),
              platformFeeAmount: BigInt(fundingTerms.message.platformFeeAmount),
            },
            signature: providerSignature as Hex,
          })
          if (recoveredProvider !== getAddress(currentCandidate.providerPayoutAddress)) failure('Funding terms were not accepted by this provider wallet.', 403)
          selectedRecord = { ...currentFound[1], fundingRequest: { settlementVersion: 3, partnerApplicationId: partner.id, partnerWalletAddress: wallet, advanceUsdcUnits: requested.toString(), fundingTerms, providerSignature: providerSignature as Hex, status: 'pending', requestedAt: now.toISOString(), expiresAt: currentCandidate.expiresAt } }
          next.records[currentFound[0]] = selectedRecord
          return next
        })
        return res.status(201).json({ ok: true, selection: { partnerId: partner.id, partnerName: partner.name, advanceUsdcUnits: selectedRecord.fundingRequest!.advanceUsdcUnits, quote: selectedRecord.fundingRequest!.fundingTerms.quote, status: 'pending' } })
      }

      const profile = approvedPartner(identity, partners, secret)
      const wallet = partnerWallet(profile)
      if (!profile) failure('This HashPayStream account is not approved for funding requests.', 403)
      if (!wallet || identity.wallets.length !== 1 || identity.wallets[0].toLowerCase() !== wallet.toLowerCase()) failure("Open Funding partners once to verify this profile's Privy wallet.", 409)

      if (req.method === 'POST') {
        if (clean(body.action, 24) !== 'decline') failure('Funding request action is invalid.', 400)
        const requestId = clean(body.requestId, 100)
        if (!REQUEST_ID.test(requestId)) failure('Funding request is invalid.', 400)
        await dependencies.mutateStore(storeKey, async current => {
          const next = safeStore(current)
          const found = findRecord(next, requestId)
          if (!found || found[1].fundingRequest?.partnerApplicationId !== profile.id || found[1].fundingRequest.status !== 'pending') failure('Funding request was not found.', 404)
          const candidate = opportunity(found[1], now, chain, minimumRemainingSeconds)
          if (!candidate || (await dependencies.position(candidate.positionId, chain)).status !== 'available') failure('This funding request can no longer be declined.', 409)
          next.records[found[0]] = { ...found[1], fundingRequest: { ...found[1].fundingRequest, status: 'declined' } }
          return next
        })
        return res.json({ ok: true, status: 'declined' })
      }

      const candidates = Object.values(store.records).flatMap(record => {
        const candidate = opportunity(record, now, chain, minimumRemainingSeconds, Boolean(record.fundingRequest))
        return candidate ? [{ record, candidate }] : []
      })
      const inspected = await Promise.all(candidates.map(async item => ({ ...item, position: await dependencies.position(item.candidate.positionId, chain) })))
      const opportunities: Array<(typeof candidates)[number]['candidate'] & {
        positionStatus: PositionState['status']
        funder?: Address
        repaymentRecipient?: Address
        fundingTerms?: SignedFundingTerms
        providerSignature?: Hex
      }> = []
      for (const { record, candidate, position } of inspected) {
        if (position.status === 'available') {
          if (candidate.live && record.fundingRequest?.settlementVersion === 3 && record.fundingRequest.status === 'pending' && record.fundingRequest.fundingTerms && record.fundingRequest.providerSignature && record.fundingRequest.partnerApplicationId === profile.id) opportunities.push({ ...candidate, requestedAdvanceUsdcUnits: record.fundingRequest.advanceUsdcUnits, fundingTerms: record.fundingRequest.fundingTerms, providerSignature: record.fundingRequest.providerSignature, positionStatus: 'available' })
          continue
        }
        const ownsPosition = identity.wallets.some(item => item.toLowerCase() === position.funder.toLowerCase() || item.toLowerCase() === position.repaymentRecipient.toLowerCase())
        if (ownsPosition) opportunities.push({ ...candidate, requestedAdvanceUsdcUnits: record.fundingRequest?.advanceUsdcUnits ?? candidate.requestedAdvanceUsdcUnits, fundingTerms: record.fundingRequest?.fundingTerms, providerSignature: record.fundingRequest?.providerSignature, positionStatus: position.status, funder: position.funder, repaymentRecipient: position.repaymentRecipient })
      }
      opportunities.sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
      return res.json({ ok: true, opportunities })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Private funding requests are temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createUpfrontOpportunitiesHandler()
