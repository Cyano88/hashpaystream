import { getAddress, recoverTypedDataAddress, type Address, type Hex } from 'viem'
import type { SettlementCheckpoint, SettlementEvidence } from '../src/lib/settlementEvidence.js'
import { agreementIntelligenceRequestHash, type AgreementIntelligenceRequest } from './agreement-intelligence-schema.js'
import {
  STOCK_DELIVERY_TERMS_TYPES,
  stockDeliveryTermsMessage,
  verifyStockDeliveryAuthorization,
  type StockDeliveryAuthorization,
} from '../src/lib/stockDeliveryProtocol.js'

export type StockDeliveryStatus = 'requested' | 'delivered' | 'settled' | 'declined' | 'expired'
export type VerifiedStockDeliveryReceipt = {
  transactionHash: Hex
  blockHash: Hex
  blockNumber: string
  deliveryId: Hex
  arcAgreementHash: Hex
  worker: Address
  funder: Address
  stockAsset: Address
  stockTokenAmount: string
  confirmedAt: string
}
export type StockDeliveryRequest = {
  id: Hex
  assessmentRequestId: string
  agreementRequest: AgreementIntelligenceRequest
  agreementId: string
  workerUserId: string
  partnerApplicationId: string
  authorization: StockDeliveryAuthorization
  workerSignature: Hex
  status: StockDeliveryStatus
  requestedAt: string
  expiresAt: string
  delivery?: VerifiedStockDeliveryReceipt
  settlementCheckpoint?: SettlementCheckpoint
  settlement?: SettlementEvidence
  updatedAt: string
}
export type StockDeliveryStore = { schema: 1; requests: Record<string, StockDeliveryRequest> }
export type StockDeliveryExposurePolicy = {
  maxDeliveryUsdcUnits: string; maxWorkerOutstandingUsdcUnits: string; maxFunderOutstandingUsdcUnits: string
  maxAssetOutstandingUsdcUnits: string; maxGlobalOutstandingUsdcUnits: string
  maxWorkerOutstandingCount: number; maxFunderOutstandingCount: number
}

function failure(message: string, status = 409): never { throw Object.assign(new Error(message), { status }) }
export function safeStockDeliveryStore(value?: StockDeliveryStore): StockDeliveryStore {
  if (value && value.schema !== 1) failure('Stock delivery storage requires review.', 503)
  return { schema: 1, requests: value?.requests ? structuredClone(value.requests) : {} }
}
function sameAddress(left: string, right: string) { return getAddress(left) === getAddress(right) }

export function stockDeliveryLifecycle(storeValue: StockDeliveryStore | undefined, now: Date) {
  const store = safeStockDeliveryStore(storeValue), timestamp = now.getTime()
  if (!Number.isFinite(timestamp)) failure('Stock delivery lifecycle time is invalid.', 503)
  for (const [id, request] of Object.entries(store.requests)) {
    if (request.status === 'requested' && (!Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= timestamp)) store.requests[id] = { ...request, status: 'expired', updatedAt: now.toISOString() }
  }
  return store
}

function exposureUnits(value: string) { if (!/^[1-9]\d{0,77}$/.test(value)) failure('Stock delivery exposure policy is invalid.', 503); return BigInt(value) }
export function stockDeliveryExposureReason(storeValue: StockDeliveryStore | undefined, input: {
  workerUserId: string; partnerApplicationId: string; authorization: StockDeliveryAuthorization; policy: StockDeliveryExposurePolicy; now: number
}) {
  const policy = input.policy, next = input.authorization
  if (!Number.isSafeInteger(input.now) || input.now <= 0) failure('Stock delivery exposure time is invalid.', 503)
  const limits = {
    delivery: exposureUnits(policy.maxDeliveryUsdcUnits), worker: exposureUnits(policy.maxWorkerOutstandingUsdcUnits),
    funder: exposureUnits(policy.maxFunderOutstandingUsdcUnits), asset: exposureUnits(policy.maxAssetOutstandingUsdcUnits),
    global: exposureUnits(policy.maxGlobalOutstandingUsdcUnits),
  }
  if (!Number.isInteger(policy.maxWorkerOutstandingCount) || policy.maxWorkerOutstandingCount < 1 || policy.maxWorkerOutstandingCount > 100
    || !Number.isInteger(policy.maxFunderOutstandingCount) || policy.maxFunderOutstandingCount < 1 || policy.maxFunderOutstandingCount > 100
    || limits.delivery > limits.worker || limits.delivery > limits.funder || limits.delivery > limits.asset || limits.delivery > limits.global) failure('Stock delivery exposure policy is invalid.', 503)
  const advance = exposureUnits(next.terms.advanceUsdcAmount), liability = exposureUnits(next.terms.funderRepaymentAmount)
  if (advance > limits.delivery || liability > limits.delivery || liability > limits.worker || liability > limits.funder || liability > limits.asset || liability > limits.global) return 'This stock delivery exceeds the pilot limit.'
  const active = Object.values(safeStockDeliveryStore(storeValue).requests).filter(item => item.status === 'delivered' || (item.status === 'requested' && Date.parse(item.expiresAt) > input.now * 1000))
  const sum = (items: StockDeliveryRequest[]) => items.reduce((total, item) => total + exposureUnits(item.authorization.terms.funderRepaymentAmount), 0n)
  const worker = active.filter(item => item.workerUserId === input.workerUserId)
  const funder = active.filter(item => item.partnerApplicationId === input.partnerApplicationId)
  const asset = active.filter(item => sameAddress(item.authorization.terms.stockAsset, next.terms.stockAsset))
  if (worker.length >= policy.maxWorkerOutstandingCount || sum(worker) + liability > limits.worker) return 'This worker reached the stock pilot limit.'
  if (funder.length >= policy.maxFunderOutstandingCount || sum(funder) + liability > limits.funder) return 'This funder reached the stock pilot limit.'
  if (sum(asset) + liability > limits.asset) return 'This stock token reached the pilot limit.'
  if (sum(active) + liability > limits.global) return 'The stock pilot reached its global limit.'
}

export async function createStockDeliveryRequest(storeValue: StockDeliveryStore | undefined, input: {
  assessmentRequestId: string
  agreementRequest: AgreementIntelligenceRequest
  agreementId: string
  workerUserId: string
  partnerApplicationId: string
  authorization: StockDeliveryAuthorization
  workerSignature: Hex
  expected: Parameters<typeof verifyStockDeliveryAuthorization>[1]
  exposure: StockDeliveryExposurePolicy
  now: Date
}) {
  if (!/^uai_[a-zA-Z0-9]{12,80}$/.test(input.assessmentRequestId) || !/^agr_[a-zA-Z0-9]{12,64}$/.test(input.agreementId)
    || !input.workerUserId || !/^fpa_[a-f0-9-]{36}$/.test(input.partnerApplicationId)) failure('The stock delivery request is invalid.', 400)
  if (input.agreementRequest.requestId !== input.assessmentRequestId || ('0x' + agreementIntelligenceRequestHash(input.agreementRequest).slice(7)).toLowerCase() !== input.authorization.offer.intelligenceCommitment.toLowerCase()) failure('The stock delivery assessment does not match its authorization.', 409)
  await verifyStockDeliveryAuthorization(input.authorization, input.expected)
  const recoveredWorker = await recoverTypedDataAddress({
    domain: input.authorization.domain,
    types: STOCK_DELIVERY_TERMS_TYPES,
    primaryType: 'DeliveryTerms',
    message: stockDeliveryTermsMessage(input.authorization.terms),
    signature: input.workerSignature,
  })
  if (!sameAddress(recoveredWorker, input.expected.worker)) failure('The worker signature is invalid.', 403)
  const now = Math.floor(input.now.getTime() / 1000)
  if (!Number.isSafeInteger(now) || input.authorization.terms.deadline <= now) failure('The stock delivery offer expired.')
  const store = safeStockDeliveryStore(storeValue)
  const id = input.authorization.deliveryId
  const priorForDelivery = store.requests[id]
  const priorForAgreement = Object.values(store.requests).find(item => item.authorization.protection.arcAgreementHash.toLowerCase() === input.authorization.protection.arcAgreementHash.toLowerCase() && item.status !== 'declined' && item.status !== 'expired')
  const requestedAt = input.now.toISOString()
  const request: StockDeliveryRequest = {
    id,
    assessmentRequestId: input.assessmentRequestId,
    agreementRequest: structuredClone(input.agreementRequest),
    agreementId: input.agreementId,
    workerUserId: input.workerUserId,
    partnerApplicationId: input.partnerApplicationId,
    authorization: input.authorization,
    workerSignature: input.workerSignature,
    status: 'requested',
    requestedAt,
    expiresAt: new Date(input.authorization.terms.deadline * 1000).toISOString(),
    updatedAt: requestedAt,
  }
  if (priorForDelivery) {
    const exactReplay = priorForDelivery.assessmentRequestId === input.assessmentRequestId
      && JSON.stringify(priorForDelivery.agreementRequest) === JSON.stringify(input.agreementRequest)
      && priorForDelivery.agreementId === input.agreementId
      && priorForDelivery.workerUserId === input.workerUserId
      && priorForDelivery.partnerApplicationId === input.partnerApplicationId
      && priorForDelivery.workerSignature === input.workerSignature
      && JSON.stringify(priorForDelivery.authorization) === JSON.stringify(input.authorization)
    if (exactReplay) return { store, request: priorForDelivery }
    failure('This stock delivery reference already exists.')
  }
  if (priorForAgreement) failure('This protected agreement already has a stock delivery request.')
  const exposureReason = stockDeliveryExposureReason(store, { workerUserId: input.workerUserId, partnerApplicationId: input.partnerApplicationId, authorization: input.authorization, policy: input.exposure, now })
  if (exposureReason) failure(exposureReason)
  if (Object.keys(store.requests).length >= 10_000) failure('The stock delivery pilot capacity has been reached.', 503)
  store.requests[id] = request
  return { store, request }
}

export function stockDeliveryRequestsForWorker(storeValue: StockDeliveryStore | undefined, workerUserId: string) {
  return Object.values(safeStockDeliveryStore(storeValue).requests).filter(item => item.workerUserId === workerUserId)
}
export function stockDeliveryRequestsForFunder(storeValue: StockDeliveryStore | undefined, partnerApplicationId: string) {
  return Object.values(safeStockDeliveryStore(storeValue).requests).filter(item => item.partnerApplicationId === partnerApplicationId)
}

export function recordVerifiedStockDelivery(storeValue: StockDeliveryStore | undefined, input: {
  deliveryId: Hex
  partnerApplicationId: string
  funder: Address
  receipt: VerifiedStockDeliveryReceipt
  now: Date
}) {
  const store = safeStockDeliveryStore(storeValue), request = store.requests[input.deliveryId]
  if (!request || request.partnerApplicationId !== input.partnerApplicationId || !sameAddress(request.authorization.terms.funder, input.funder)) failure('Stock delivery request was not found.', 404)
  if (request.status === 'delivered' && request.delivery?.transactionHash === input.receipt.transactionHash) return { store, request }
  if (request.status !== 'requested') failure('This stock delivery request is closed.')
  const { authorization } = request, receipt = input.receipt
  if (!/^0x[a-fA-F0-9]{64}$/.test(receipt.transactionHash) || !/^0x[a-fA-F0-9]{64}$/.test(receipt.blockHash)
    || !/^[1-9]\d{0,77}$/.test(receipt.blockNumber) || !Number.isFinite(Date.parse(receipt.confirmedAt))) failure('The confirmed stock delivery receipt is invalid.')
  if (receipt.deliveryId !== authorization.deliveryId || receipt.arcAgreementHash !== authorization.protection.arcAgreementHash
    || !sameAddress(receipt.worker, authorization.offer.worker) || !sameAddress(receipt.funder, authorization.terms.funder)
    || !sameAddress(receipt.stockAsset, authorization.terms.stockAsset) || receipt.stockTokenAmount !== authorization.terms.stockTokenAmount) failure('The confirmed stock delivery does not match the signed request.')
  const updated: StockDeliveryRequest = { ...request, status: 'delivered', delivery: receipt, updatedAt: input.now.toISOString() }
  store.requests[input.deliveryId] = updated
  return { store, request: updated }
}

export function recordVerifiedStockSettlement(storeValue: StockDeliveryStore | undefined, input: { deliveryId: Hex; evidence: SettlementEvidence; now: Date }) {
  const store = safeStockDeliveryStore(storeValue), request = store.requests[input.deliveryId], evidence = input.evidence
  if (!request) failure('Stock delivery is not ready for settlement.', 404)
  if (request.status === 'settled' && request.settlement) {
    if (request.settlement.transactionHash === evidence.transactionHash && request.settlement.blockHash === evidence.blockHash && request.settlement.logIndex === evidence.logIndex) return { store, request }
    failure('Stock settlement evidence conflicts with the recorded receipt.')
  }
  if (request.status !== 'delivered' || !request.delivery) failure('Stock delivery is not ready for settlement.', 404)
  const authorization = request.authorization
  if (evidence.chainId !== 5_042_002 || !/^0x[a-fA-F0-9]{40}$/.test(evidence.router) || !sameAddress(evidence.router, authorization.protection.arcRecipient)
    || !/^0x[a-fA-F0-9]{64}$/.test(evidence.transactionHash) || !/^0x[a-fA-F0-9]{64}$/.test(evidence.blockHash)
    || !/^\d{1,78}$/.test(evidence.blockNumber) || !Number.isSafeInteger(evidence.logIndex) || evidence.logIndex < 0
    || evidence.agreementHash.toLowerCase() !== authorization.protection.arcAgreementHash.toLowerCase()
    || !/^\d{1,78}$/.test(evidence.funderAmount) || !/^\d{1,78}$/.test(evidence.providerAmount) || !/^\d{1,78}$/.test(evidence.treasuryAmount)
    || evidence.funderAmount !== authorization.terms.funderRepaymentAmount || evidence.treasuryAmount !== authorization.terms.platformFeeAmount
    || BigInt(evidence.funderAmount) + BigInt(evidence.providerAmount) + BigInt(evidence.treasuryAmount) !== BigInt(authorization.offer.protectedAmount)) failure('Arc settlement evidence does not match the stock delivery.')
  const updated = { ...request, status: 'settled' as const, settlement: evidence, updatedAt: input.now.toISOString() }
  store.requests[input.deliveryId] = updated
  return { store, request: updated }
}

export function saveStockSettlementCheckpoint(storeValue: StockDeliveryStore | undefined, input: { deliveryId: Hex; checkpoint: SettlementCheckpoint; now: Date }) {
  const store = safeStockDeliveryStore(storeValue), request = store.requests[input.deliveryId]
  if (!request || (request.status !== 'delivered' && !(request.status === 'settled' && !request.settlement))) failure('Stock delivery is not ready for settlement.', 404)
  if (input.checkpoint.chainId !== 5_042_002 || !/^0x[a-fA-F0-9]{40}$/.test(input.checkpoint.router) || !sameAddress(input.checkpoint.router, request.authorization.protection.arcRecipient) || input.checkpoint.agreementHash.toLowerCase() !== request.authorization.protection.arcAgreementHash.toLowerCase() || !/^\\d{1,78}$/.test(input.checkpoint.nextBlock)) failure('Stock settlement checkpoint does not match the delivery.')
  store.requests[input.deliveryId] = { ...request, settlementCheckpoint: input.checkpoint, updatedAt: input.now.toISOString() }
  return store
}

export function declineStockDelivery(storeValue: StockDeliveryStore | undefined, input: { deliveryId: Hex; partnerApplicationId: string; funder: Address; now: Date }) {
  const store = safeStockDeliveryStore(storeValue), request = store.requests[input.deliveryId]
  if (!request || request.partnerApplicationId !== input.partnerApplicationId || !sameAddress(request.authorization.terms.funder, input.funder)) failure('Stock delivery request was not found.', 404)
  if (request.status !== 'requested') failure('This stock delivery request is closed.')
  const updated: StockDeliveryRequest = { ...request, status: 'declined', updatedAt: input.now.toISOString() }
  store.requests[input.deliveryId] = updated
  return { store, request: updated }
}
