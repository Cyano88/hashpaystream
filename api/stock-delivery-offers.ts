import { createPublicClient, getAddress, http, isAddress, keccak256, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { FundingPartnerRecord, FundingPartnerStore } from './funding-partners.js'
import { agreementIntelligenceRequestHash } from './agreement-intelligence-schema.js'
import type { UpfrontAssessmentRecord } from './upfront-assessment.js'
import { readStockConfig, type StockConfig } from './stock-early-pay-config.js'
import { readStockMarket, type StockMarketSnapshot } from './stock-early-pay-chain.js'
import type { StockParticipantScope } from './stock-participant-clearance.js'
import { buildSignedStockDelivery, type SignedStockDeliveryBundle } from './stock-delivery-terms.js'
import { AGREEMENT_BACKED_STOCK_DELIVERY_ABI, STOCK_DELIVERY_TOKEN_ABI } from '../src/lib/stockDeliveryProtocol.js'

const HEX_32 = /^0x[a-fA-F0-9]{64}$/
const MAX_PARTNERS_PER_REQUEST = 10
export type StockDeliveryRuntime = {
  chainId: number; contract: Address; asset: Address; treasury: Address
  underwritingSigner: Address; riskSigner: Address; protectionSigner: Address
  arcRepaymentRouter: Address; runtimeHash: Hex; rpcUrl: string
}
export type AuthoritativeStockAgreement = {
  id: string; status: string; recipient: string
  chain: { network: string; chainId: number; onchainAgreementId: string; termsHash: string; amountUsdcUnits: string; remainingUsdcUnits: string; expiresAt: string }
}
export type StockDeliveryOfferOption = {
  partnerId: string; partnerName: string; feeBps: number; advanceUsdcUnits: string
  stockTokenAmount: string; assetSymbol: string; assetDecimals: number
  authorization: SignedStockDeliveryBundle
}
type BuildDependencies = {
  market: (config: StockConfig, scope: StockParticipantScope) => Promise<StockMarketSnapshot>
  capacity: (runtime: StockDeliveryRuntime, stock: StockConfig, funder: Address, tokenAmount?: bigint) => Promise<{ ready: boolean; balance: bigint }>
  build: typeof buildSignedStockDelivery
  now: () => number
}
function invalid(message: string, status = 409): never { throw Object.assign(new Error(message), { status }) }
function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function key(value: unknown, label: string): Hex { const text = clean(value, 66); if (!HEX_32.test(text)) invalid(`${label} is unavailable.`, 503); return text as Hex }
function address(value: unknown, label: string): Address { const text = clean(value, 42); if (!isAddress(text) || /^0x0{40}$/i.test(text)) invalid(`${label} is unavailable.`, 503); return getAddress(text) }

async function productionCapacity(runtime: StockDeliveryRuntime, stock: StockConfig, funder: Address, tokenAmount?: bigint) {
  const client = createPublicClient({ transport: http(stock.rpcUrl, { timeout: 7_000, retryCount: 0 }) })
  const block = await client.getBlock()
  const common = { address: runtime.contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, blockNumber: block.number } as const
  const [chainId, code, paused, arcRouter, underwritingSigner, riskSigner, protectionSigner, funderAllowed, assetAllowed, balance] = await Promise.all([
    client.getChainId(), client.getCode({ address: runtime.contract, blockNumber: block.number }),
    client.readContract({ ...common, functionName: 'paused' }),
    client.readContract({ ...common, functionName: 'arcRepaymentRouter' }),
    client.readContract({ ...common, functionName: 'underwritingSigner' }),
    client.readContract({ ...common, functionName: 'riskSigner' }),
    client.readContract({ ...common, functionName: 'protectionSigner' }),
    client.readContract({ ...common, functionName: 'allowedFunders', args: [funder] }),
    client.readContract({ ...common, functionName: 'allowedStockAssets', args: [runtime.asset] }),
    client.readContract({ address: runtime.asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'balanceOf', args: [funder], blockNumber: block.number }),
  ])
  if (chainId !== runtime.chainId || !code || keccak256(code) !== runtime.runtimeHash || getAddress(arcRouter) !== runtime.arcRepaymentRouter
    || getAddress(underwritingSigner) !== runtime.underwritingSigner || getAddress(riskSigner) !== runtime.riskSigner
    || getAddress(protectionSigner) !== runtime.protectionSigner) invalid('The stock delivery contract is unavailable.', 503)
  return { ready: paused === false && funderAllowed === true && assetAllowed === true && (tokenAmount === undefined || balance >= tokenAmount), balance }
}
const defaults: BuildDependencies = { market: readStockMarket, capacity: productionCapacity, build: buildSignedStockDelivery, now: () => Math.floor(Date.now() / 1000) }

export async function buildEligibleStockDeliveryOffers(input: {
  record: UpfrontAssessmentRecord; agreement: AuthoritativeStockAgreement; partners: FundingPartnerStore | undefined
  worker: Address; runtime: StockDeliveryRuntime; stock: StockConfig; arcRepaymentRouter: Address
  policyVersion: string; underwritingKey: Hex; riskKey: Hex; protectionKey: Hex
}, overrides: Partial<BuildDependencies> = {}): Promise<StockDeliveryOfferOption[]> {
  const dependencies = { ...defaults, ...overrides }, request = input.record.request
  if (!request || input.record.status !== 'completed' || input.record.agreementId !== input.agreement.id
    || (input.record.response?.decision as { decision?: string } | undefined)?.decision !== 'APPROVE') invalid('The approved stock opportunity was not found.', 404)
  if (input.stock.chainId !== input.runtime.chainId || input.stock.asset !== input.runtime.asset || input.stock.rpcUrl !== input.runtime.rpcUrl
    || input.stock.marketAdapter !== 'xlayer-dex-v1' || input.stock.marketDataProvider !== 'twelve-data') invalid('The stock market configuration does not match delivery.', 503)
  const candidates = Object.values(input.partners?.applications ?? {})
    .filter((item): item is FundingPartnerRecord & { walletAddress: Address; stockFeeBps: number } => item.status === 'approved' && item.stockOffersEnabled === true && Number.isInteger(item.stockFeeBps) && item.stockFeeBps! >= 1 && item.stockFeeBps! <= Math.min(300, input.stock.policy.maxFeeBps) && Boolean(item.walletAddress && isAddress(item.walletAddress)))
    .sort((left, right) => left.stockFeeBps - right.stockFeeBps || left.id.localeCompare(right.id))
    .slice(0, MAX_PARTNERS_PER_REQUEST)
  const now = dependencies.now()
  const results = await Promise.allSettled(candidates.map(async partner => {
    const funder = getAddress(partner.walletAddress)
    const preliminary = await dependencies.capacity(input.runtime, input.stock, funder)
    if (!preliminary.ready) return undefined
    const scope: StockParticipantScope = { chainId: input.runtime.chainId, asset: input.runtime.asset, worker: input.worker, funder,
      earningsId: input.agreement.chain.onchainAgreementId as Hex, principalUsdcUnits: request.advance.requestedUsdcUnits, policyVersion: input.policyVersion }
    const market = await dependencies.market(input.stock, scope)
    const authorization = await dependencies.build({
      request, agreement: input.agreement, intelligenceCommitment: agreementIntelligenceRequestHash(request),
      worker: input.worker, workerArcRecipient: request.settlement.providerRecipient, funder, repaymentRecipient: funder,
      platformTreasury: input.runtime.treasury, arcRepaymentRouter: input.arcRepaymentRouter, stockAsset: input.runtime.asset,
      assetDecimals: input.stock.assetDecimals, advanceUsdcUnits: request.advance.requestedUsdcUnits, feeBps: partner.stockFeeBps,
      market, policyVersion: input.policyVersion, policy: input.stock.policy, chainId: input.runtime.chainId,
      deliveryContract: input.runtime.contract, underwritingKey: input.underwritingKey, riskKey: input.riskKey,
      protectionKey: input.protectionKey, now,
    })
    const capacity = await dependencies.capacity(input.runtime, input.stock, funder, BigInt(authorization.terms.stockTokenAmount))
    if (!capacity.ready) return undefined
    return { partnerId: partner.id, partnerName: partner.name, feeBps: partner.stockFeeBps,
      advanceUsdcUnits: authorization.terms.advanceUsdcAmount, stockTokenAmount: authorization.terms.stockTokenAmount,
      assetSymbol: input.stock.assetSymbol, assetDecimals: input.stock.assetDecimals, authorization }
  }))
  const offers = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
  if (!offers.length) {
    const operational = results.find(result => result.status === 'rejected' && Number((result.reason as { status?: number }).status) >= 500)
    if (operational?.status === 'rejected') throw operational.reason
  }
  return offers
}

async function fetchAgreement(id: string, baseUrl: string, apiKey: string): Promise<AuthoritativeStockAgreement> {
  const response = await fetch(`${baseUrl}/api/v2/agreements?id=${encodeURIComponent(id)}`, { cache: 'no-store', headers: { 'x-api-key': apiKey, accept: 'application/json' } })
  const body = await response.json().catch(() => ({})) as { agreement?: AuthoritativeStockAgreement; error?: string }
  if (!response.ok || !body.agreement) invalid(clean(body.error, 240) || 'The protected agreement is unavailable.', response.status >= 400 ? response.status : 502)
  return body.agreement
}
export async function listProductionStockDeliveryOffers(input: { record: UpfrontAssessmentRecord; partners: FundingPartnerStore | undefined; worker: Address; runtime: StockDeliveryRuntime; env: NodeJS.ProcessEnv }) {
  const env = input.env, stock = readStockConfig(env), agreementId = clean(input.record.agreementId, 80)
  let base: URL
  try { base = new URL(clean(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 240)) } catch { invalid('Agreement verification is unavailable.', 503) }
  const apiKey = clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 200), policyVersion = clean(env.HASHPAYSTREAM_STOCK_DELIVERY_POLICY_VERSION, 80)
  if (!agreementId || base!.protocol !== 'https:' || base!.username || base!.password || base!.search || base!.hash || apiKey.length < 32 || !policyVersion) invalid('Stock offer verification is unavailable.', 503)
  const underwritingKey = key(env.HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER_KEY, 'Stock underwriting signer')
  const riskKey = key(env.HASHPAYSTREAM_STOCK_RISK_SIGNER_KEY, 'Stock risk signer')
  const protectionKey = key(env.HASHPAYSTREAM_STOCK_PROTECTION_SIGNER_KEY, 'Stock protection signer')
  if (privateKeyToAccount(underwritingKey).address !== input.runtime.underwritingSigner || privateKeyToAccount(riskKey).address !== input.runtime.riskSigner || privateKeyToAccount(protectionKey).address !== input.runtime.protectionSigner) invalid('Stock delivery signer configuration does not match.', 503)
  const agreement = await fetchAgreement(agreementId, base!.origin, apiKey)
  return buildEligibleStockDeliveryOffers({ record: input.record, agreement, partners: input.partners, worker: input.worker, runtime: input.runtime, stock,
    arcRepaymentRouter: input.runtime.arcRepaymentRouter, policyVersion,
    underwritingKey, riskKey, protectionKey })
}