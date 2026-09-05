import { createHash } from 'node:crypto'
import { decodeEventLog, getAddress, isAddress, type Address, type Hex } from 'viem'

export const ERC20_TRANSFER_EVENT = {
  type: 'event', name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

export const ARC_AGREEMENT_EVENTS = [
  { type: 'event', name: 'AgreementActivated', inputs: [
    { indexed: true, name: 'agreementId', type: 'bytes32' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ] },
  { type: 'event', name: 'StepReleased', inputs: [
    { indexed: true, name: 'agreementId', type: 'bytes32' },
    { indexed: true, name: 'step', type: 'uint8' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'totalReleased', type: 'uint256' },
    { indexed: false, name: 'evidenceHash', type: 'bytes32' },
  ] },
  { type: 'event', name: 'AgreementCancelled', inputs: [
    { indexed: true, name: 'agreementId', type: 'bytes32' },
    { indexed: true, name: 'actor', type: 'address' },
    { indexed: false, name: 'refundedAmount', type: 'uint256' },
    { indexed: false, name: 'reasonHash', type: 'bytes32' },
  ] },
  { type: 'event', name: 'AgreementRefunded', inputs: [
    { indexed: true, name: 'agreementId', type: 'bytes32' },
    { indexed: false, name: 'refundedAmount', type: 'uint256' },
  ] },
] as const

export const UPFRONT_EVENTS = [
  { type: 'event', name: 'AdvanceFunded', inputs: [
    { indexed: true, name: 'positionId', type: 'bytes32' },
    { indexed: true, name: 'funder', type: 'address' },
    { indexed: true, name: 'provider', type: 'address' },
    { indexed: false, name: 'repaymentRecipient', type: 'address' },
    { indexed: false, name: 'providerArcRecipient', type: 'address' },
    { indexed: false, name: 'platformTreasury', type: 'address' },
    { indexed: false, name: 'protectedAmount', type: 'uint256' },
    { indexed: false, name: 'advanceAmount', type: 'uint256' },
    { indexed: false, name: 'funderRepaymentAmount', type: 'uint256' },
    { indexed: false, name: 'platformFeeAmount', type: 'uint256' },
    { indexed: false, name: 'termsHash', type: 'bytes32' },
    { indexed: false, name: 'intelligenceCommitment', type: 'bytes32' },
    { indexed: false, name: 'protectionDeadline', type: 'uint48' },
  ] },
  { type: 'event', name: 'AdvanceReleased', inputs: [
    { indexed: true, name: 'positionId', type: 'bytes32' },
    { indexed: true, name: 'arcAgreementHash', type: 'bytes32' },
    { indexed: true, name: 'provider', type: 'address' },
    { indexed: false, name: 'advanceAmount', type: 'uint256' },
  ] },
  { type: 'event', name: 'AdvanceRefunded', inputs: [
    { indexed: true, name: 'positionId', type: 'bytes32' },
    { indexed: true, name: 'funder', type: 'address' },
    { indexed: false, name: 'advanceAmount', type: 'uint256' },
  ] },
] as const

export const REPAYMENT_EVENTS = [{
  type: 'event', name: 'RepaymentSettled', inputs: [
    { indexed: true, name: 'arcAgreementHash', type: 'bytes32' },
    { indexed: true, name: 'arcTermsHash', type: 'bytes32' },
    { indexed: true, name: 'funder', type: 'address' },
    { indexed: false, name: 'provider', type: 'address' },
    { indexed: false, name: 'treasury', type: 'address' },
    { indexed: false, name: 'funderAmount', type: 'uint256' },
    { indexed: false, name: 'providerAmount', type: 'uint256' },
    { indexed: false, name: 'treasuryAmount', type: 'uint256' },
  ],
}] as const

export type ReceiptLog = {
  address: Address; topics: readonly Hex[]; data: Hex; logIndex: number
}

export type ConfirmedReceipt = {
  status: 'success' | 'reverted'
  transactionHash: Hex
  blockNumber: bigint
  blockHash: Hex
  logs: ReceiptLog[]
}

export type ExpectedTransfer = { from: Address; to: Address; amountUnits: string }

export type ExpectedReceiptEvidence = {
  network: 'arc-testnet' | 'xlayer-mainnet'
  chainId: 5_042_002 | 196
  contractAddress: Address
  tokenAddress: Address
  eventName: 'AgreementActivated' | 'StepReleased' | 'AgreementCancelled' | 'AgreementRefunded'
    | 'AdvanceFunded' | 'AdvanceReleased' | 'AdvanceRefunded' | 'RepaymentSettled'
  identityField: 'agreementId' | 'positionId' | 'arcAgreementHash'
  identity: Hex
  expectedBlockNumber?: bigint
  expectedBlockHash?: Hex
  headBlockNumber: bigint
  minimumConfirmations: number
  eventAmounts: Record<string, string>
  eventAddresses?: Record<string, Address>
  eventHashes?: Record<string, Hex>
  transfers: ExpectedTransfer[]
}

const EVENT_ABI = [...ARC_AGREEMENT_EVENTS, ...UPFRONT_EVENTS, ...REPAYMENT_EVENTS] as const

function canonical(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function sameAddress(left: unknown, right: Address) {
  return isAddress(String(left ?? '')) && getAddress(String(left)) === getAddress(right)
}

function sameHex(left: unknown, right: Hex) {
  return /^0x[a-f0-9]+$/i.test(String(left ?? ''))
    && String(left).toLowerCase() === right.toLowerCase()
}

function decode(log: ReceiptLog, abi: readonly unknown[]) {
  try {
    return decodeEventLog({ abi, data: log.data, topics: log.topics as [] | [Hex, ...Hex[]], strict: true }) as {
      eventName: string; args: Record<string, unknown>
    }
  } catch {
    return undefined
  }
}

export function verifyConfirmedReceipt(receipt: ConfirmedReceipt, expected: ExpectedReceiptEvidence) {
  const codes: string[] = []
  if (receipt.status !== 'success') codes.push('TRANSACTION_REVERTED')
  if (!/^0x[a-f0-9]{64}$/i.test(receipt.transactionHash) || !/^0x[a-f0-9]{64}$/i.test(receipt.blockHash)) codes.push('RECEIPT_IDENTITY_INVALID')
  if (expected.expectedBlockNumber !== undefined && receipt.blockNumber !== expected.expectedBlockNumber) codes.push('BLOCK_NUMBER_MISMATCH')
  if (expected.expectedBlockHash !== undefined && !sameHex(receipt.blockHash, expected.expectedBlockHash)) codes.push('BLOCK_HASH_MISMATCH')
  const confirmations = expected.headBlockNumber >= receipt.blockNumber
    ? expected.headBlockNumber - receipt.blockNumber + 1n
    : 0n
  if (!Number.isInteger(expected.minimumConfirmations) || expected.minimumConfirmations < 1 || confirmations < BigInt(expected.minimumConfirmations)) {
    codes.push('CONFIRMATIONS_INSUFFICIENT')
  }

  const contractLogs = receipt.logs
    .filter(log => getAddress(log.address) === getAddress(expected.contractAddress))
    .map(log => ({ log, decoded: decode(log, EVENT_ABI) }))
    .filter(item => item.decoded?.eventName === expected.eventName)
  const matchingEvents = contractLogs.filter(item => sameHex(item.decoded?.args?.[expected.identityField], expected.identity))
  const event = matchingEvents.length === 1 ? matchingEvents[0] : undefined
  if (matchingEvents.length > 1) codes.push('CONTRACT_EVENT_AMBIGUOUS')
  else if (!event?.decoded) codes.push('CONTRACT_EVENT_MISSING')
  else {
    for (const [field, amount] of Object.entries(expected.eventAmounts)) {
      if (!/^\d{1,78}$/.test(amount) || String(event.decoded.args[field] ?? '') !== amount) codes.push('EVENT_AMOUNT_MISMATCH')
    }
    for (const [field, address] of Object.entries(expected.eventAddresses ?? {})) {
      if (!sameAddress(event.decoded.args[field], address)) codes.push('EVENT_ADDRESS_MISMATCH')
    }
    for (const [field, value] of Object.entries(expected.eventHashes ?? {})) {
      if (String(event.decoded.args[field] ?? '').toLowerCase() !== value.toLowerCase()) codes.push('EVENT_HASH_MISMATCH')
    }
  }

  const unusedTransferLogs = receipt.logs
    .filter(log => getAddress(log.address) === getAddress(expected.tokenAddress))
    .map(log => ({ log, decoded: decode(log, [ERC20_TRANSFER_EVENT]) }))
  for (const transfer of expected.transfers) {
    const matchedIndex = unusedTransferLogs.findIndex(item => item.decoded?.eventName === 'Transfer'
      && sameAddress(item.decoded.args.from, transfer.from)
      && sameAddress(item.decoded.args.to, transfer.to)
      && String(item.decoded.args.value ?? '') === transfer.amountUnits)
    if (matchedIndex < 0) codes.push('TOKEN_TRANSFER_MISSING')
    else unusedTransferLogs.splice(matchedIndex, 1)
  }

  const uniqueCodes = [...new Set(codes)].sort()
  const payload = {
    network: expected.network,
    chainId: expected.chainId,
    transactionHash: receipt.transactionHash.toLowerCase(),
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash.toLowerCase(),
    contractAddress: getAddress(expected.contractAddress).toLowerCase(),
    tokenAddress: getAddress(expected.tokenAddress).toLowerCase(),
    eventName: expected.eventName,
    identityField: expected.identityField,
    identity: expected.identity.toLowerCase(),
    minimumConfirmations: expected.minimumConfirmations,
    eventAmounts: expected.eventAmounts,
    eventAddresses: Object.fromEntries(Object.entries(expected.eventAddresses ?? {}).map(([field, address]) => [field, getAddress(address).toLowerCase()])),
    eventHashes: Object.fromEntries(Object.entries(expected.eventHashes ?? {}).map(([field, value]) => [field, value.toLowerCase()])),
    transfers: expected.transfers.map(transfer => ({
      from: getAddress(transfer.from).toLowerCase(),
      to: getAddress(transfer.to).toLowerCase(),
      amountUnits: transfer.amountUnits,
    })),
  }
  return {
    verified: uniqueCodes.length === 0,
    codes: uniqueCodes,
    confirmations: confirmations.toString(),
    transactionHash: receipt.transactionHash.toLowerCase() as Hex,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash.toLowerCase() as Hex,
    logIndex: event?.log.logIndex,
    payloadHash: hash(payload),
    payload,
  }
}
