import { getAddress, parseAbi, parseEventLogs, type Address, type Hex, type TransactionReceipt } from 'viem'

export class SavingsTransactionError extends Error {}
class SavingsReceiptIndexError extends Error {}

export type SavingsIntent = {
  action: 'approve' | 'createPlan' | 'withdraw' | 'requestEmergencyExit' | 'cancelEmergencyExit' | 'completeEmergencyExit'
  amount?: string
  releaseAmount?: string
  interval?: number
  planId?: Hex
}
export type SavingsTransactionScope = { chainId: number; owner: Address; vault: Address; asset: Address }
export type PendingSavingsTransaction = { hash: Hex; intent: SavingsIntent; superseded?: boolean }
export type SavingsReplacementHandler = (replacement: { hash: Hex; reason: 'repriced' | 'cancelled' | 'replaced' }) => void
export const savingsReceiptEvents = parseAbi([
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event PlanCreated(bytes32 indexed planId, address indexed owner, uint256 amount, uint256 releaseAmount, uint48 firstReleaseAt, uint32 interval)',
  'event SavingsWithdrawn(bytes32 indexed planId, address indexed owner, uint256 amount)',
  'event EmergencyExitRequested(bytes32 indexed planId, address indexed owner, uint48 availableAt)',
  'event EmergencyExitCancelled(bytes32 indexed planId, address indexed owner)',
  'event EmergencyExitCompleted(bytes32 indexed planId, address indexed owner, uint256 amount)',
])
const memory = new Map<string, PendingSavingsTransaction>()
const locks = new Set<string>()
const key = (scope: SavingsTransactionScope) => `hashpaystream:savings-transaction:${scope.chainId}:${scope.owner.toLowerCase()}:${scope.vault.toLowerCase()}:${scope.asset.toLowerCase()}`

export function readSavingsReceiptReferences(scope: SavingsTransactionScope): PendingSavingsTransaction[] {
  const raw = window.localStorage.getItem(`${key(scope)}:receipts`)
  if (!raw) return []
  const entries = JSON.parse(raw)
  if (!Array.isArray(entries)) throw new SavingsReceiptIndexError('Savings receipt references could not be loaded.')
  return entries.filter(value => /^0x[0-9a-fA-F]{64}$/.test(value?.hash) && ['createPlan', 'withdraw', 'completeEmergencyExit'].includes(value?.intent?.action)).slice(0, 100)
}

export function readSavingsTransaction(scope: SavingsTransactionScope): PendingSavingsTransaction | undefined {
  const id = key(scope)
  if (memory.has(id)) return memory.get(id)
  const raw = window.localStorage.getItem(id)
  if (!raw) return undefined
  const value = JSON.parse(raw) as PendingSavingsTransaction
  if (!/^0x[0-9a-fA-F]{64}$/.test(value.hash) || !['approve', 'createPlan', 'withdraw', 'requestEmergencyExit', 'cancelEmergencyExit', 'completeEmergencyExit'].includes(value.intent?.action)) throw new Error('Saved savings transaction needs review.')
  memory.set(id, value)
  return value
}

export function verifySavingsReceipt(scope: SavingsTransactionScope, pending: PendingSavingsTransaction, receipt: TransactionReceipt) {
  const { intent } = pending
  if (receipt.transactionHash.toLowerCase() !== pending.hash.toLowerCase() || receipt.status !== 'success'
    || getAddress(receipt.from) !== getAddress(scope.owner)
    || !receipt.to || getAddress(receipt.to) !== getAddress(intent.action === 'approve' ? scope.asset : scope.vault)) throw new Error('Savings receipt does not match the submitted transaction.')
  const tokenLogs = parseEventLogs({ abi: savingsReceiptEvents, logs: receipt.logs.filter(log => getAddress(log.address) === getAddress(scope.asset)) })
  if (intent.action === 'approve') {
    if (!tokenLogs.some(event => event.eventName === 'Approval' && getAddress(event.args.owner) === getAddress(scope.owner) && getAddress(event.args.spender) === getAddress(scope.vault) && event.args.value === BigInt(intent.amount!))) throw new Error('Savings allowance confirmation mismatch.')
    return
  }
  const logs = parseEventLogs({ abi: savingsReceiptEvents, logs: receipt.logs.filter(log => getAddress(log.address) === getAddress(scope.vault)) })
  const eventName = { createPlan: 'PlanCreated', withdraw: 'SavingsWithdrawn', requestEmergencyExit: 'EmergencyExitRequested', cancelEmergencyExit: 'EmergencyExitCancelled', completeEmergencyExit: 'EmergencyExitCompleted' }[intent.action]
  const matched = logs.some(event => {
    if (event.eventName !== eventName || !('owner' in event.args) || getAddress(event.args.owner) !== getAddress(scope.owner)) return false
    if (event.eventName === 'PlanCreated') return event.args.amount === BigInt(intent.amount!) && event.args.releaseAmount === BigInt(intent.releaseAmount!) && event.args.interval === intent.interval
    if (!('planId' in event.args) || event.args.planId !== intent.planId) return false
    if (event.eventName === 'SavingsWithdrawn' || event.eventName === 'EmergencyExitCompleted') return event.args.amount === BigInt(intent.amount!)
    return true
  })
  if (!matched) throw new Error('Savings event confirmation mismatch.')
  if (['createPlan', 'withdraw', 'completeEmergencyExit'].includes(intent.action)) {
    const inbound = intent.action === 'createPlan'
    const transfers = tokenLogs.filter(event => event.eventName === 'Transfer'
      && getAddress(event.args.from) === getAddress(inbound ? scope.owner : scope.vault)
      && getAddress(event.args.to) === getAddress(inbound ? scope.vault : scope.owner))
    if (transfers.length !== 1 || transfers[0].eventName !== 'Transfer' || transfers[0].args.value !== BigInt(intent.amount!)) throw new Error('Savings token transfer confirmation mismatch.')
  }
}

// A retry checks the saved hash and original intent; it never resubmits that operation.
export async function runSavingsTransaction(scope: SavingsTransactionScope, intent: SavingsIntent, submit: () => Promise<Hex>, wait: (hash: Hex, onReplacement: SavingsReplacementHandler) => Promise<TransactionReceipt>) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(key(scope), { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) throw new Error('A savings transaction is already being checked in another tab.')
      return runLockedSavingsTransaction(scope, intent, submit, wait)
    })
  }
  return runLockedSavingsTransaction(scope, intent, submit, wait)
}

async function runLockedSavingsTransaction(scope: SavingsTransactionScope, intent: SavingsIntent, submit: () => Promise<Hex>, wait: (hash: Hex, onReplacement: SavingsReplacementHandler) => Promise<TransactionReceipt>) {
  const id = key(scope)
  if (locks.has(id)) throw new Error('A savings transaction is already being checked.')
  locks.add(id)
  let verified = false
  try {
    let pending = readSavingsTransaction(scope)
    if (!pending) {
      // Check storage availability before asking the wallet to send funds.
      const probe = `${id}:storage-check`
      window.localStorage.setItem(probe, '1'); window.localStorage.removeItem(probe)
      const hash = await submit()
      pending = { hash, intent }
      memory.set(id, pending)
      window.localStorage.setItem(id, JSON.stringify(pending))
    }
    const receipt = await wait(pending.hash, replacement => {
      pending = { ...pending!, hash: replacement.hash, superseded: pending!.superseded || replacement.reason !== 'repriced' }
      memory.set(id, pending)
      window.localStorage.setItem(id, JSON.stringify(pending))
    })
    if (receipt.transactionHash.toLowerCase() !== pending.hash.toLowerCase()) throw new Error('Savings receipt hash mismatch.')
    if (getAddress(receipt.from) !== getAddress(scope.owner)) throw new Error('Savings receipt owner mismatch.')
    if (pending.superseded) {
      window.localStorage.removeItem(id); memory.delete(id)
      throw new SavingsTransactionError('The wallet replaced this transaction. Check its result before starting another savings action.')
    }
    if (receipt.status === 'reverted') {
      window.localStorage.removeItem(id); memory.delete(id)
      throw new SavingsTransactionError('Savings transaction reverted. No savings funds moved.')
    }
    verifySavingsReceipt(scope, pending, receipt)
    verified = true
    if (['createPlan', 'withdraw', 'completeEmergencyExit'].includes(pending.intent.action)) {
      let references: PendingSavingsTransaction[]
      try { references = readSavingsReceiptReferences(scope) }
      catch (reason) {
        if (!(reason instanceof SyntaxError || reason instanceof SavingsReceiptIndexError)) throw reason
        // Preserve the unreadable optional index before rebuilding it from chain-verified evidence.
        const raw = window.localStorage.getItem(`${id}:receipts`)
        if (raw !== null) window.localStorage.setItem(`${id}:receipts:unreadable`, raw)
        references = []
      }
      references = references.filter(item => item.hash.toLowerCase() !== pending!.hash.toLowerCase())
      window.localStorage.setItem(`${id}:receipts`, JSON.stringify([pending, ...references].slice(0, 100)))
    }
    window.localStorage.removeItem(id); memory.delete(id)
    return pending.intent
  } catch (reason) {
    if (memory.has(id)) throw new SavingsTransactionError(verified ? 'Your savings transaction is confirmed, but its receipt could not be saved on this device. Check transaction to retry saving it.' : 'Your savings transaction is awaiting verification. Check transaction to continue.')
    throw reason
  } finally {
    locks.delete(id)
  }
}
