import { randomBytes } from 'node:crypto'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { agreementIntelligenceRequestHash, type AgreementIntelligenceRequest } from './agreement-intelligence-schema.js'
import type { StockMarketSnapshot } from './stock-early-pay-chain.js'
import type { StockRiskPolicy } from '../src/lib/stockFundingOffers.js'
import {
  STOCK_DELIVERY_PROTECTION_TYPES, STOCK_DELIVERY_TERMS_TYPES, STOCK_DELIVERY_UNDERWRITING_TYPES,
  stockDeliveryDomain, stockDeliveryOfferHash, stockDeliveryProtectionMessage, stockDeliveryTermsHash,
  stockDeliveryTermsMessage, stockDeliveryUnderwritingMessage, type StockDeliveryProtectionWire,
  type StockDeliveryTermsWire, type StockDeliveryUnderwritingWire,
} from '../src/lib/stockDeliveryProtocol.js'

const BPS = 10_000n
const MAX_FEE_BPS = 300
const MAX_AUTHORIZATION_SECONDS = 300
const ARC_CHAIN_ID = 5_042_002
const HEX_32 = /^0x[a-fA-F0-9]{64}$/
function invalid(message: string, status = 409): never { throw Object.assign(new Error(message), { status }) }
function address(value: string, label: string) { if (!isAddress(value) || /^0x0{40}$/i.test(value)) invalid(`${label} is invalid.`); return getAddress(value) }
function units(value: string, label: string) { if (!/^[1-9]\d{0,77}$/.test(value)) invalid(`${label} is invalid.`); return BigInt(value) }
function hex32(value: string, label: string) { if (!HEX_32.test(value)) invalid(`${label} is invalid.`); return value as Hex }
function nonce(): Hex { return `0x${randomBytes(32).toString('hex')}` }
function ceilBps(value: bigint, feeBps: number) { return (value * BigInt(feeBps) + BPS - 1n) / BPS }

export type StockDeliveryFeeQuote = { feeBps: number; advanceUsdcUnits: string; totalFundingFeeUsdcUnits: string; funderProfitUsdcUnits: string; funderRepaymentUsdcUnits: string; platformFeeUsdcUnits: string; workerRemainderUsdcUnits: string }
export function quoteStockDeliveryFees(input: { protectedAmount: bigint; advanceAmount: bigint; feeBps: number }): StockDeliveryFeeQuote {
  if (input.protectedAmount <= 0n || input.advanceAmount <= 0n || input.advanceAmount >= input.protectedAmount) invalid('The stock payment amount cannot be priced safely.')
  if (!Number.isInteger(input.feeBps) || input.feeBps < 1 || input.feeBps > MAX_FEE_BPS) invalid('The stock funding fee exceeds the permitted limit.')
  const totalFee = ceilBps(input.advanceAmount, input.feeBps), platformFundingFee = totalFee * 2_000n / BPS
  const funderProfit = totalFee - platformFundingFee, platformFee = ceilBps(input.protectedAmount, 100) + platformFundingFee
  const funderRepayment = input.advanceAmount + funderProfit, workerRemainder = input.protectedAmount - funderRepayment - platformFee
  if (funderProfit <= 0n || platformFee <= 0n || workerRemainder <= 0n) invalid('The protected payment is too small for the stock payment split.')
  return { feeBps: input.feeBps, advanceUsdcUnits: input.advanceAmount.toString(), totalFundingFeeUsdcUnits: totalFee.toString(), funderProfitUsdcUnits: funderProfit.toString(), funderRepaymentUsdcUnits: funderRepayment.toString(), platformFeeUsdcUnits: platformFee.toString(), workerRemainderUsdcUnits: workerRemainder.toString() }
}

export type SignedStockDeliveryBundle = {
  domain: ReturnType<typeof stockDeliveryDomain>; offer: StockDeliveryUnderwritingWire; offerHash: Hex; underwritingSigner: Address; underwritingSignature: Hex;
  terms: StockDeliveryTermsWire; deliveryId: Hex; riskSigner: Address; riskSignature: Hex; protection: StockDeliveryProtectionWire;
  protectionSigner: Address; protectionSignature: Hex; quote: StockDeliveryFeeQuote
}
export async function buildSignedStockDelivery(input: {
  request: AgreementIntelligenceRequest
  agreement: { status: string; recipient: string; chain: { network: string; chainId: number; onchainAgreementId: string; termsHash: string; amountUsdcUnits: string; remainingUsdcUnits: string; expiresAt: string } }
  intelligenceCommitment: string; worker: string; workerArcRecipient: string; funder: string; repaymentRecipient: string; platformTreasury: string;
  arcRepaymentRouter: string; stockAsset: string; assetDecimals: number; advanceUsdcUnits: string; feeBps: number; market: StockMarketSnapshot;
  policyVersion: string; policy: StockRiskPolicy; chainId: number; deliveryContract: string; underwritingKey: Hex; riskKey: Hex; protectionKey: Hex;
  now: number; nonce?: () => Hex
}): Promise<SignedStockDeliveryBundle> {
  const { request, agreement, market } = input
  if (request.agreement.state !== 'funded' || agreement.status !== 'active') invalid('Stock delivery requires an active funded agreement.')
  if (input.intelligenceCommitment !== agreementIntelligenceRequestHash(request)) invalid('The underwriting commitment does not match this agreement.')
  if (address(request.advance.providerPayoutAddress, 'Worker payout wallet') !== address(input.worker, 'Worker wallet')
    || address(request.settlement.providerRecipient, 'Worker Arc recipient') !== address(input.workerArcRecipient, 'Worker Arc recipient')) invalid('The assessed worker wallets do not match this stock delivery.')
  if (!request.agreement.protectionDeadline || request.agreement.protectionDeadline <= input.now) invalid('The agreement protection window has expired.')
  if (agreement.chain.network !== 'arc' || agreement.chain.chainId !== ARC_CHAIN_ID) invalid('The repayment agreement is not on the approved Arc network.')
  const protectedAmount = units(request.agreement.amountUsdcUnits, 'Protected amount')
  if (agreement.chain.amountUsdcUnits !== protectedAmount.toString() || agreement.chain.remainingUsdcUnits !== protectedAmount.toString()) invalid('The Arc protected balance does not match this agreement.')
  if (Number(agreement.chain.expiresAt) !== request.agreement.protectionDeadline) invalid('The Arc agreement expiry does not match the assessed agreement.')
  if (address(agreement.recipient, 'Arc repayment recipient') !== address(input.arcRepaymentRouter, 'Arc repayment router')) invalid('The agreement does not pay the approved Arc repayment router.')
  const advanceAmount = units(input.advanceUsdcUnits, 'Stock payment amount')
  if (advanceAmount > protectedAmount * BigInt(request.advance.requestedBps) / BPS) invalid('The stock payment exceeds the worker approved amount.')
  if (request.advance.requestedBps < 1_000 || request.advance.requestedBps > 8_000) invalid('The approved advance rate is invalid.')
  if (market.chainId !== input.chainId || market.asset.toLowerCase() !== input.stockAsset.toLowerCase()) invalid('The stock market evidence does not match this delivery.')
  if (!market.participantClearance
    || market.participantClearance.chainId !== input.chainId
    || market.participantClearance.asset.toLowerCase() !== input.stockAsset.toLowerCase()
    || market.participantClearance.worker.toLowerCase() !== input.worker.toLowerCase()
    || market.participantClearance.funder.toLowerCase() !== input.funder.toLowerCase()
    || market.participantClearance.earningsId.toLowerCase() !== agreement.chain.onchainAgreementId.toLowerCase()
    || market.participantClearance.principalUsdcUnits !== input.advanceUsdcUnits
    || market.participantClearance.policyVersion !== input.policyVersion) invalid('Participant eligibility does not match this delivery.')
  if (market.tradingAvailable !== true || market.transfersAvailable !== true || market.issuerEligible !== true) invalid('The stock asset is currently unavailable.')
  if (!Number.isSafeInteger(market.observedAt) || !Number.isSafeInteger(market.eligibleUntil) || market.observedAt > input.now || market.eligibleUntil <= input.now || input.now - market.observedAt >= MAX_AUTHORIZATION_SECONDS) invalid('The stock quote is stale or invalid.')
  const policy = input.policy
  if (policy.chainId !== input.chainId || policy.asset.toLowerCase() !== input.stockAsset.toLowerCase() || policy.assetDecimals !== input.assetDecimals
    || !Number.isInteger(policy.maxFeeBps) || policy.maxFeeBps < 1 || policy.maxFeeBps > MAX_FEE_BPS
    || !Number.isInteger(policy.maxPriceAgeSeconds) || policy.maxPriceAgeSeconds < 1 || policy.maxPriceAgeSeconds > MAX_AUTHORIZATION_SECONDS
    || !Number.isInteger(policy.maxVolatilityBps) || policy.maxVolatilityBps < 0 || policy.maxVolatilityBps > 10_000
    || !Number.isInteger(policy.maxQuoteDeviationBps) || policy.maxQuoteDeviationBps < 0 || policy.maxQuoteDeviationBps > 10_000) invalid('The stock delivery policy is invalid.')
  if (input.feeBps > policy.maxFeeBps || market.volatilityBps > policy.maxVolatilityBps) invalid('The stock offer exceeds the approved risk limits.')
  const clearance = market.participantClearance
  if (clearance.workerEligible !== true || clearance.funderEligible !== true
    || !Number.isSafeInteger(clearance.checkedAt) || !Number.isSafeInteger(clearance.expiresAt) || clearance.checkedAt <= 0
    || clearance.checkedAt > input.now || input.now - clearance.checkedAt > policy.maxPriceAgeSeconds
    || clearance.expiresAt < market.eligibleUntil || clearance.tokenAmount !== undefined) invalid('Participant eligibility is stale or incomplete.')
  if (!Number.isInteger(input.assetDecimals) || input.assetDecimals < 0 || input.assetDecimals > 18) invalid('Stock token decimals are invalid.')
  const unitPrice = units(market.unitPriceUsdcUnits, 'Stock unit price'), tokenUnit = 10n ** BigInt(input.assetDecimals)
  const tokenAmount = advanceAmount * tokenUnit / unitPrice
  if (tokenAmount <= 0n) invalid('The eligible payment is too small for this stock token.')
  if (!market.dex || market.dex.tokenAmount !== tokenAmount.toString()
    || !Number.isSafeInteger(market.dex.observedAt) || !Number.isSafeInteger(market.dex.expiresAt)
    || market.dex.expiresAt < market.eligibleUntil || !HEX_32.test(market.dex.blockHash) || market.dex.observedAt > input.now
    || input.now - market.dex.observedAt > policy.maxPriceAgeSeconds) invalid('The executable X Layer quote does not match this delivery.')
  const executableValue = units(market.dex.amountOutUsdcUnits, 'Executable stock quote')
  const executableLiquidity = units(market.executableLiquidityUsdcUnits, 'Executable stock liquidity')
  const minimumLiquidity = units(policy.minExecutableLiquidityUsdcUnits, 'Minimum stock liquidity')
  if (executableLiquidity < minimumLiquidity || executableLiquidity < advanceAmount) invalid('Executable stock liquidity is insufficient.')
  const quoteDifference = executableValue > advanceAmount ? executableValue - advanceAmount : advanceAmount - executableValue
  if (quoteDifference * BPS > advanceAmount * BigInt(policy.maxQuoteDeviationBps)) invalid('The executable stock quote moved beyond the approved limit.')
  const referenceValue = tokenAmount * unitPrice / tokenUnit
  if (referenceValue > advanceAmount || advanceAmount - referenceValue > 1n) invalid('The stock quantity does not match the fixed USDC value.')
  const worker = address(input.worker, 'Worker wallet'), workerArcRecipient = address(input.workerArcRecipient, 'Worker Arc recipient')
  const funder = address(input.funder, 'Funder wallet'), repaymentRecipient = address(input.repaymentRecipient, 'Funder repayment recipient')
  const platformTreasury = address(input.platformTreasury, 'Platform treasury'), stockAsset = address(input.stockAsset, 'Stock asset')
  const arcRecipient = address(input.arcRepaymentRouter, 'Arc repayment router')
  if (worker === funder || workerArcRecipient === repaymentRecipient || workerArcRecipient === platformTreasury || repaymentRecipient === platformTreasury) invalid('Delivery and repayment wallets must be separate.')
  const deliveryContract = address(input.deliveryContract, 'Stock delivery contract'), quote = quoteStockDeliveryFees({ protectedAmount, advanceAmount, feeBps: input.feeBps })
  const domain = stockDeliveryDomain(input.chainId, deliveryContract), nextNonce = input.nonce ?? nonce
  const deadline = Math.min(market.eligibleUntil, input.now + MAX_AUTHORIZATION_SECONDS), underwritingDeadline = deadline
  if (deadline <= input.now || request.agreement.protectionDeadline <= underwritingDeadline) invalid('The stock delivery authorization window is invalid.')
  const agreementTermsHash = hex32('0x' + request.agreement.termsHash.replace(/^sha256:/, ''), 'Agreement terms commitment')
  const offer: StockDeliveryUnderwritingWire = { worker, agreementTermsHash, intelligenceCommitment: hex32(input.intelligenceCommitment.replace(/^sha256:/, '0x'), 'Intelligence commitment'), protectedAmount: protectedAmount.toString(), maxAdvanceBps: request.advance.requestedBps, protectionDeadline: request.agreement.protectionDeadline, underwritingDeadline, nonce: nextNonce() }
  const offerHash = stockDeliveryOfferHash(domain, offer)
  const terms: StockDeliveryTermsWire = { offerHash, funder, repaymentRecipient, workerArcRecipient, platformTreasury, stockAsset, stockTokenAmount: tokenAmount.toString(), advanceUsdcAmount: advanceAmount.toString(), funderRepaymentAmount: quote.funderRepaymentUsdcUnits, platformFeeAmount: quote.platformFeeUsdcUnits, marketObservedAt: market.observedAt, deadline, nonce: nextNonce() }
  const deliveryId = stockDeliveryTermsHash(domain, terms)
  const protection: StockDeliveryProtectionWire = { deliveryId, arcAgreementHash: hex32(agreement.chain.onchainAgreementId, 'Arc agreement commitment'), arcTermsHash: hex32(agreement.chain.termsHash, 'Arc terms commitment'), agreementTermsHash, deliveryTermsHash: deliveryId, arcRecipient, funder, repaymentRecipient, worker, protectedAmount: protectedAmount.toString(), advanceUsdcAmount: advanceAmount.toString(), observedAt: input.now, deadline }
  const underwriting = privateKeyToAccount(input.underwritingKey), risk = privateKeyToAccount(input.riskKey), protectionSigner = privateKeyToAccount(input.protectionKey)
  return { domain, offer, offerHash, underwritingSigner: underwriting.address, underwritingSignature: await underwriting.signTypedData({ domain, types: STOCK_DELIVERY_UNDERWRITING_TYPES, primaryType: 'UnderwritingOffer', message: stockDeliveryUnderwritingMessage(offer) }), terms, deliveryId, riskSigner: risk.address, riskSignature: await risk.signTypedData({ domain, types: STOCK_DELIVERY_TERMS_TYPES, primaryType: 'DeliveryTerms', message: stockDeliveryTermsMessage(terms) }), protection, protectionSigner: protectionSigner.address, protectionSignature: await protectionSigner.signTypedData({ domain, types: STOCK_DELIVERY_PROTECTION_TYPES, primaryType: 'ProtectionAttestation', message: stockDeliveryProtectionMessage(protection) }), quote }
}
