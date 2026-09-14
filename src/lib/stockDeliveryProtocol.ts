import { getAddress, hashTypedData, isAddress, parseAbi, recoverTypedDataAddress, type Address, type Hex } from 'viem'

export const STOCK_DELIVERY_VERSION = '1' as const
export const STOCK_DELIVERY_UNDERWRITING_TYPES = { UnderwritingOffer: [
  { name: 'worker', type: 'address' }, { name: 'agreementTermsHash', type: 'bytes32' },
  { name: 'intelligenceCommitment', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' },
  { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
  { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] } as const
export const STOCK_DELIVERY_TERMS_TYPES = { DeliveryTerms: [
  { name: 'offerHash', type: 'bytes32' }, { name: 'funder', type: 'address' },
  { name: 'repaymentRecipient', type: 'address' }, { name: 'workerArcRecipient', type: 'address' },
  { name: 'platformTreasury', type: 'address' }, { name: 'stockAsset', type: 'address' },
  { name: 'stockTokenAmount', type: 'uint256' }, { name: 'advanceUsdcAmount', type: 'uint256' },
  { name: 'funderRepaymentAmount', type: 'uint256' }, { name: 'platformFeeAmount', type: 'uint256' },
  { name: 'marketObservedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] } as const
export const STOCK_DELIVERY_PROTECTION_TYPES = { ProtectionAttestation: [
  { name: 'deliveryId', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
  { name: 'arcTermsHash', type: 'bytes32' }, { name: 'agreementTermsHash', type: 'bytes32' },
  { name: 'deliveryTermsHash', type: 'bytes32' }, { name: 'arcRecipient', type: 'address' },
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' },
  { name: 'worker', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
  { name: 'advanceUsdcAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
] } as const

export type StockDeliveryDomain = { name: 'HashPayStream Stock Delivery'; version: typeof STOCK_DELIVERY_VERSION; chainId: number; verifyingContract: Address }
export type StockDeliveryUnderwritingWire = { worker: Address; agreementTermsHash: Hex; intelligenceCommitment: Hex; protectedAmount: string; maxAdvanceBps: number; protectionDeadline: number; underwritingDeadline: number; nonce: Hex }
export type StockDeliveryTermsWire = { offerHash: Hex; funder: Address; repaymentRecipient: Address; workerArcRecipient: Address; platformTreasury: Address; stockAsset: Address; stockTokenAmount: string; advanceUsdcAmount: string; funderRepaymentAmount: string; platformFeeAmount: string; marketObservedAt: number; deadline: number; nonce: Hex }
export type StockDeliveryProtectionWire = { deliveryId: Hex; arcAgreementHash: Hex; arcTermsHash: Hex; agreementTermsHash: Hex; deliveryTermsHash: Hex; arcRecipient: Address; funder: Address; repaymentRecipient: Address; worker: Address; protectedAmount: string; advanceUsdcAmount: string; observedAt: number; deadline: number }
export type StockDeliveryAuthorization = {
  domain: StockDeliveryDomain
  offer: StockDeliveryUnderwritingWire
  offerHash: Hex
  underwritingSigner: Address
  underwritingSignature: Hex
  terms: StockDeliveryTermsWire
  deliveryId: Hex
  riskSigner: Address
  riskSignature: Hex
  protection: StockDeliveryProtectionWire
  protectionSigner: Address
  protectionSignature: Hex
}

export function stockDeliveryDomain(chainId: number, verifyingContract: Address): StockDeliveryDomain { return { name: 'HashPayStream Stock Delivery', version: STOCK_DELIVERY_VERSION, chainId, verifyingContract } }
export const stockDeliveryUnderwritingMessage = (value: StockDeliveryUnderwritingWire) => ({ ...value, protectedAmount: BigInt(value.protectedAmount) })
export const stockDeliveryTermsMessage = (value: StockDeliveryTermsWire) => ({ ...value, stockTokenAmount: BigInt(value.stockTokenAmount), advanceUsdcAmount: BigInt(value.advanceUsdcAmount), funderRepaymentAmount: BigInt(value.funderRepaymentAmount), platformFeeAmount: BigInt(value.platformFeeAmount) })
export const stockDeliveryProtectionMessage = (value: StockDeliveryProtectionWire) => ({ ...value, protectedAmount: BigInt(value.protectedAmount), advanceUsdcAmount: BigInt(value.advanceUsdcAmount) })
export function stockDeliveryOfferHash(domain: StockDeliveryDomain, offer: StockDeliveryUnderwritingWire) { return hashTypedData({ domain, types: STOCK_DELIVERY_UNDERWRITING_TYPES, primaryType: 'UnderwritingOffer', message: stockDeliveryUnderwritingMessage(offer) }) }
export function stockDeliveryTermsHash(domain: StockDeliveryDomain, terms: StockDeliveryTermsWire) { return hashTypedData({ domain, types: STOCK_DELIVERY_TERMS_TYPES, primaryType: 'DeliveryTerms', message: stockDeliveryTermsMessage(terms) }) }
function sameAddress(left: string, right: string) { return isAddress(left) && isAddress(right) && getAddress(left) === getAddress(right) }

export async function verifyStockDeliveryAuthorization(value: StockDeliveryAuthorization, expected: {
  chainId: number; deliveryContract: Address; worker: Address; workerArcRecipient: Address; funder: Address;
  repaymentRecipient: Address; platformTreasury: Address; stockAsset: Address; advanceUsdcAmount: string;
  underwritingSigner: Address; riskSigner: Address; protectionSigner: Address; now: number
}) {
  if (value.domain.name !== 'HashPayStream Stock Delivery' || value.domain.version !== STOCK_DELIVERY_VERSION
    || value.domain.chainId !== expected.chainId || !sameAddress(value.domain.verifyingContract, expected.deliveryContract)
    || !sameAddress(value.offer.worker, expected.worker) || !sameAddress(value.terms.funder, expected.funder)
    || !sameAddress(value.terms.repaymentRecipient, expected.repaymentRecipient)
    || !sameAddress(value.terms.workerArcRecipient, expected.workerArcRecipient)
    || !sameAddress(value.terms.platformTreasury, expected.platformTreasury)
    || !sameAddress(value.terms.stockAsset, expected.stockAsset)
    || value.terms.advanceUsdcAmount !== expected.advanceUsdcAmount) throw new Error('The stock delivery authorization does not match this offer.')
  if (!Number.isSafeInteger(expected.now) || value.terms.deadline <= expected.now || value.offer.underwritingDeadline !== value.terms.deadline
    || value.terms.marketObservedAt > expected.now || expected.now - value.terms.marketObservedAt >= 300
    || value.protection.observedAt > expected.now || value.protection.deadline !== value.terms.deadline) throw new Error('The stock delivery authorization expired.')
  const offerHash = stockDeliveryOfferHash(value.domain, value.offer)
  const deliveryId = stockDeliveryTermsHash(value.domain, value.terms)
  if (value.offerHash !== offerHash || value.terms.offerHash !== offerHash || value.deliveryId !== deliveryId
    || value.protection.deliveryId !== deliveryId || value.protection.deliveryTermsHash !== deliveryId
    || value.protection.agreementTermsHash !== value.offer.agreementTermsHash
    || value.protection.protectedAmount !== value.offer.protectedAmount
    || value.protection.advanceUsdcAmount !== value.terms.advanceUsdcAmount
    || !sameAddress(value.protection.worker, value.offer.worker) || !sameAddress(value.protection.funder, value.terms.funder)
    || !sameAddress(value.protection.repaymentRecipient, value.terms.repaymentRecipient)) throw new Error('The stock delivery commitments do not match.')
  const [underwriting, risk, protection] = await Promise.all([
    recoverTypedDataAddress({ domain: value.domain, types: STOCK_DELIVERY_UNDERWRITING_TYPES, primaryType: 'UnderwritingOffer', message: stockDeliveryUnderwritingMessage(value.offer), signature: value.underwritingSignature }),
    recoverTypedDataAddress({ domain: value.domain, types: STOCK_DELIVERY_TERMS_TYPES, primaryType: 'DeliveryTerms', message: stockDeliveryTermsMessage(value.terms), signature: value.riskSignature }),
    recoverTypedDataAddress({ domain: value.domain, types: STOCK_DELIVERY_PROTECTION_TYPES, primaryType: 'ProtectionAttestation', message: stockDeliveryProtectionMessage(value.protection), signature: value.protectionSignature }),
  ])
  if (!sameAddress(underwriting, expected.underwritingSigner) || !sameAddress(value.underwritingSigner, expected.underwritingSigner)
    || !sameAddress(risk, expected.riskSigner) || !sameAddress(value.riskSigner, expected.riskSigner)
    || !sameAddress(protection, expected.protectionSigner) || !sameAddress(value.protectionSigner, expected.protectionSigner)) throw new Error('The stock delivery signer is not approved.')
  return { offerHash, deliveryId }
}

export const AGREEMENT_BACKED_STOCK_DELIVERY_ABI = parseAbi([
  'struct UnderwritingOffer { address worker; bytes32 agreementTermsHash; bytes32 intelligenceCommitment; uint256 protectedAmount; uint16 maxAdvanceBps; uint48 protectionDeadline; uint48 underwritingDeadline; bytes32 nonce; }',
  'struct DeliveryTerms { bytes32 offerHash; address funder; address repaymentRecipient; address workerArcRecipient; address platformTreasury; address stockAsset; uint256 stockTokenAmount; uint256 advanceUsdcAmount; uint256 funderRepaymentAmount; uint256 platformFeeAmount; uint48 marketObservedAt; uint48 deadline; bytes32 nonce; }',
  'struct ProtectionAttestation { bytes32 deliveryId; bytes32 arcAgreementHash; bytes32 arcTermsHash; bytes32 agreementTermsHash; bytes32 deliveryTermsHash; address arcRecipient; address funder; address repaymentRecipient; address worker; uint256 protectedAmount; uint256 advanceUsdcAmount; uint48 observedAt; uint48 deadline; }',
  'function paused() view returns (bool)', 'function allowedFunders(address) view returns (bool)', 'function allowedStockAssets(address) view returns (bool)',
  'function usedArcAgreements(bytes32) view returns (bool)', 'function hashUnderwritingOffer(UnderwritingOffer) view returns (bytes32)',
  'function hashDeliveryTerms(DeliveryTerms) view returns (bytes32)', 'function hashProtectionAttestation(ProtectionAttestation) view returns (bytes32)',
  'function deliver(UnderwritingOffer,DeliveryTerms,ProtectionAttestation,bytes,bytes,bytes,bytes) returns (bytes32)',
  'event StockDelivered(bytes32 indexed deliveryId,bytes32 indexed arcAgreementHash,address indexed worker,address funder,address repaymentRecipient,address workerArcRecipient,address platformTreasury,address stockAsset,uint256 stockTokenAmount,uint256 protectedAmount,uint256 advanceUsdcAmount,uint256 funderRepaymentAmount,uint256 platformFeeAmount,bytes32 agreementTermsHash,bytes32 intelligenceCommitment)',
])
export const STOCK_DELIVERY_TOKEN_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)', 'function allowance(address owner,address spender) view returns (uint256)', 'function balanceOf(address owner) view returns (uint256)'])
