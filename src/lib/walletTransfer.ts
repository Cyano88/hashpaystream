import { getAddress, parseAbi, parseEventLogs, type Address, type Hex, type TransactionReceipt } from 'viem'
export type TransferScope = { chainId: number; owner: Address; asset: Address }
export type TransferIntent = { recipient: Address; units: string }
type Pending = TransferIntent & { key: string; hash?: Hex; challengeId?: string; transactionId?: string; superseded?: boolean }
export const transferStorageKey = (scope: TransferScope) => `hashpaystream:transfer:${scope.chainId}:${scope.owner.toLowerCase()}:${scope.asset.toLowerCase()}`
// Read-only migration of the 1.0.23 journal. New payments use durable intents.
export function readPendingTransfer(scope: TransferScope): Pending | undefined {
  const raw = window.localStorage.getItem(transferStorageKey(scope))
  return raw ? JSON.parse(raw) : undefined
}
export function verifyTransfer(scope: TransferScope, intent: TransferIntent, hash: Hex, receipt: TransactionReceipt) {
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || receipt.status !== 'success') throw Error('Transfer is not confirmed.')
  const events=parseEventLogs({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),logs:receipt.logs.filter(log=>getAddress(log.address)===getAddress(scope.asset))})
  const matches=events.filter(event=>getAddress(event.args.from)===getAddress(scope.owner) && getAddress(event.args.to)===getAddress(intent.recipient))
  if(matches.length!==1 || matches[0].args.value!==BigInt(intent.units))throw Error('Transfer confirmation does not match the intended recipient and amount.')
}

const approving = new Set<string>()
export async function withPaymentSubmission<T>(id: string, submit: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (approving.has(id)) throw Error('This payment is already being approved.')
    approving.add(id)
    try { return await submit() } finally { approving.delete(id) }
  }
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('hashpaystream:approve:' + id, { ifAvailable: true }, lock => {
    if (!lock) throw Error('This payment is being approved in another window.')
    return run()
  })
  return run()
}
