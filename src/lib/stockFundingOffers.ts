/** Stock-only terms. Never send these through the legacy Upfront FundingTerms API. */
export const STOCK_WORKER_RISK = 'Your tokens can lose value. Your scheduled USDC deduction stays fixed, even if their value falls. Selling may not always be available.'
export const STOCK_FUNDER_RISK = 'You send the worker your stock tokens now. On the payment date, you receive the agreed USDC amount plus your fee from the money reserved in escrow. That amount stays the same whether the stock price rises or falls. A problem with the escrow contract could delay or prevent payment, and USDC could lose value.'

export type StockOffer = {
  id: string
  funderId: string
  funderName: string
  asset: string
  chainId: number
  tokenUnits: string
  principalUsdcUnits: string
  feeBps: number
  repayAt: number
  expiresAt: number
}
export type StockRiskPolicy = {
  chainId: number
  asset: string
  assetSymbol: string
  assetDecimals: number
  maxFeeBps: number
  maxVolatilityBps: number
  minExecutableLiquidityUsdcUnits: string
  maxPriceAgeSeconds: number
  maxQuoteDeviationBps: number
}
export type StockRiskEvidence = {
  asset: string
  observedAt: number
  eligibleUntil: number
  volatilityBps: number
  executableLiquidityUsdcUnits: string
  referenceValueUsdcUnits: string
  tokenUnits: string
  tradingAvailable: boolean
  transfersAvailable: boolean
  issuerEligible: boolean
}
export type StockEligibilityContext = {
  now: number
  repayAt: number
  requestedPrincipalUsdcUnits: string
  unreservedEarningsUsdcUnits: string
  inventoryTokenUnits: string
  funderApproved: boolean
  workerEligible: boolean
  policy?: StockRiskPolicy
  evidence?: StockRiskEvidence
}
const units = (value: string) => /^(0|[1-9]\d*)$/.test(value) ? BigInt(value) : undefined
const bps = (value: number) => Number.isInteger(value) && value >= 0 && value <= 10_000
const timestamp = (value: number) => Number.isSafeInteger(value) && value > 0
const address = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value)

export function stockFeeUnits(principal: bigint, feeBps: number, maxFeeBps: number) {
  if (principal <= 0n || !bps(feeBps) || !bps(maxFeeBps) || feeBps > maxFeeBps) throw new Error('Invalid stock funding fee.')
  return principal * BigInt(feeBps) / 10_000n
}

/** Pure validation. The server must supply verified evidence; browser input is never authority. */
export function stockOfferUnavailableReason(offer: StockOffer, context: StockEligibilityContext): string | undefined {
  const { policy, evidence, now } = context
  if (!policy || !evidence) return 'Risk checks are unavailable.'
  if (!policy.assetSymbol || !Number.isInteger(policy.assetDecimals) || policy.assetDecimals < 0 || policy.assetDecimals > 18) return 'Asset details are unavailable.'
  if (context.funderApproved !== true || context.workerEligible !== true) return 'This offer is unavailable for this account.'
  if (!timestamp(now) || !timestamp(offer.expiresAt) || !timestamp(offer.repayAt) ||
      offer.expiresAt <= now || offer.repayAt <= now || offer.repayAt !== context.repayAt ||
      offer.chainId !== policy.chainId || !Number.isSafeInteger(policy.chainId) || policy.chainId <= 0 ||
      !address(offer.asset) || offer.asset.toLowerCase() !== policy.asset.toLowerCase() ||
      offer.asset.toLowerCase() !== evidence.asset.toLowerCase()) return 'This offer no longer matches your payment.'
  if (!bps(policy.maxFeeBps) || !bps(offer.feeBps) || offer.feeBps > policy.maxFeeBps) return 'The fee exceeds the permitted limit.'
  if (!Number.isSafeInteger(policy.maxPriceAgeSeconds) || policy.maxPriceAgeSeconds <= 0 ||
      !timestamp(evidence.observedAt) || !timestamp(evidence.eligibleUntil) ||
      evidence.observedAt > now || now - evidence.observedAt > policy.maxPriceAgeSeconds ||
      evidence.eligibleUntil <= now) return 'Pricing is unavailable or out of date.'
  if (!bps(policy.maxVolatilityBps) || !bps(evidence.volatilityBps) ||
      evidence.volatilityBps > policy.maxVolatilityBps ||
      evidence.tradingAvailable !== true || evidence.transfersAvailable !== true || evidence.issuerEligible !== true) return 'This asset is currently unavailable.'
  const principal = units(offer.principalUsdcUnits), token = units(offer.tokenUnits)
  const earnings = units(context.unreservedEarningsUsdcUnits), inventory = units(context.inventoryTokenUnits)
  const requested = units(context.requestedPrincipalUsdcUnits)
  const liquidity = units(evidence.executableLiquidityUsdcUnits), minimum = units(policy.minExecutableLiquidityUsdcUnits)
  const reference = units(evidence.referenceValueUsdcUnits)
  if (principal === undefined || principal <= 0n || token === undefined || token <= 0n ||
      earnings === undefined || inventory === undefined || requested !== principal ||
      evidence.tokenUnits !== offer.tokenUnits || reference === undefined || reference <= 0n ||
      liquidity === undefined || minimum === undefined || minimum <= 0n) return 'The offer could not be verified.'
  if (liquidity < minimum || liquidity < principal) return 'There is insufficient trading liquidity.'
  if (!bps(policy.maxQuoteDeviationBps) ||
      (principal > reference ? principal - reference : reference - principal) * 10_000n >
      reference * BigInt(policy.maxQuoteDeviationBps)) return 'The quote has moved too far from the verified price.'
  if (inventory < token || earnings < principal + stockFeeUnits(principal, offer.feeBps, policy.maxFeeBps)) return 'This offer is no longer fully funded.'
  return undefined
}

export type RankedFundingOffer = { id: string; feeBps: number; verifiedCompletedFundingCount?: number }
export function rankFundingOffers<T extends RankedFundingOffer>(offers: readonly T[]): T[] {
  const count = (offer: T) => Number.isSafeInteger(offer.verifiedCompletedFundingCount) && offer.verifiedCompletedFundingCount! >= 0 ? offer.verifiedCompletedFundingCount! : 0
  return [...offers].sort((a, b) => count(b) - count(a) || a.feeBps - b.feeBps || a.id.localeCompare(b.id))
}

export type StockSettlementEvidence = {
  positionId: string
  funderId: string
  employerAccountId: string
  workerAccountId: string
  deliveryConfirmed: boolean
  repaymentConfirmed: boolean
  independentParticipationReviewed: boolean
}
/** Input must already be scoped to the reviewed chain + escrow and canonical confirmed events. */
export function verifiedStockCompletionCounts(records: readonly StockSettlementEvidence[]) {
  const counts = new Map<string, number>(), seen = new Set<string>()
  for (const record of records) {
    if (!record.positionId || !record.funderId || !record.workerAccountId || !record.employerAccountId ||
        !record.deliveryConfirmed || !record.repaymentConfirmed || !record.independentParticipationReviewed ||
        record.funderId === record.workerAccountId || record.funderId === record.employerAccountId ||
        record.workerAccountId === record.employerAccountId || seen.has(record.positionId)) continue
    seen.add(record.positionId)
    counts.set(record.funderId, (counts.get(record.funderId) ?? 0) + 1)
  }
  return counts
}
