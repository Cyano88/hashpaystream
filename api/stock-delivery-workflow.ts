import { getAddress, recoverTypedDataAddress, type Address, type Hex } from 'viem'
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
  agreementId: string
  workerUserId: string
  partnerApplicationId: string
  authorization: StockDeliveryAuthorization
  workerSignature: Hex
  status: StockDeliveryStatus
  requestedAt: string
  expiresAt: string
  delivery?: VerifiedStockDeliveryReceipt
  updatedAt: string
}
export type StockDeliveryStore = { schema: 1; requests: Record<string, StockDeliveryRequest> }

function failure(message: string, status = 409): never { throw Object.assign(new Error(message), { status }) }
export function safeStockDeliveryStore(value?: StockDeliveryStore): StockDeliveryStore {
  if (value && value.schema !== 1) failure('Stock delivery storage requires review.', 503)
  return { schema: 1, requests: value?.requests ? structuredClone(value.requests) : {} }
}
function sameAddress(left: string, right: string) { return getAddress(left) === getAddress(right) }

export async function createStockDeliveryRequest(storeValue: StockDeliveryStore | undefined, input: {
  assessmentRequestId: string
  agreementId: string
  workerUserId: string
  partnerApplicationId: string
  authorization: StockDeliveryAuthorization
  workerSignature: Hex
  expected: Parameters<typeof verifyStockDeliveryAuthorization>[1]
  now: Date
}) {
  if (!/^uai_[a-zA-Z0-9]{12,80}$/.test(input.assessmentRequestId) || !/^agr_[a-zA-Z0-9]{12,64}$/.test(input.agreementId)
    || !input.workerUserId || !/^fpa_[a-f0-9-]{36}$/.test(input.partnerApplicationId)) failure('The stock delivery request is invalid.', 400)
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
  const priorForAgreement = Object.values(store.requests).find(item => item.authorization.protection.arcAgreementHash.toLowerCase() === input.authorization.protection.arcAgreementHash.toLowerCase())
  const requestedAt = input.now.toISOString()
  const request: StockDeliveryRequest = {
    id,
    assessmentRequestId: input.assessmentRequestId,
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
  if (priorForAgreement) {
    const exactReplay = priorForAgreement.id === id
      && priorForAgreement.assessmentRequestId === input.assessmentRequestId
      && priorForAgreement.agreementId === input.agreementId
      && priorForAgreement.workerUserId === input.workerUserId
      && priorForAgreement.partnerApplicationId === input.partnerApplicationId
      && priorForAgreement.workerSignature === input.workerSignature
      && JSON.stringify(priorForAgreement.authorization) === JSON.stringify(input.authorization)
    if (exactReplay) return { store, request: priorForAgreement }
    failure('This protected agreement already has a stock delivery request.')
  }
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

export function declineStockDelivery(storeValue: StockDeliveryStore | undefined, input: { deliveryId: Hex; partnerApplicationId: string; funder: Address; now: Date }) {
  const store = safeStockDeliveryStore(storeValue), request = store.requests[input.deliveryId]
  if (!request || request.partnerApplicationId !== input.partnerApplicationId || !sameAddress(request.authorization.terms.funder, input.funder)) failure('Stock delivery request was not found.', 404)
  if (request.status !== 'requested') failure('This stock delivery request is closed.')
  const updated: StockDeliveryRequest = { ...request, status: 'declined', updatedAt: input.now.toISOString() }
  store.requests[input.deliveryId] = updated
  return { store, request: updated }
}
