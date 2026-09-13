import { formatUnits, getAddress, parseEventLogs, type TransactionReceipt } from 'viem'
import { savingsReceiptEvents, verifySavingsReceipt, type PendingSavingsTransaction, type SavingsTransactionScope } from './savingsTransaction'
import { savingsChain } from './savingsChain'
import type { PaylinkReceipt } from './paymentReceiptPdf'

export function savingsPaymentReceipt(scope: SavingsTransactionScope, reference: PendingSavingsTransaction, receipt: TransactionReceipt, block: { hash: string | null; timestamp: bigint }): PaylinkReceipt {
  if (scope.chainId !== savingsChain.id || block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error('Savings receipt block mismatch.')
  verifySavingsReceipt(scope, reference, receipt)
  const action = reference.intent.action
  if (action !== 'createPlan' && action !== 'withdraw' && action !== 'completeEmergencyExit') throw new Error('This transaction did not move savings.')
  const name = action === 'createPlan' ? 'PlanCreated' : action === 'withdraw' ? 'SavingsWithdrawn' : 'EmergencyExitCompleted'
  const events = parseEventLogs({ abi: savingsReceiptEvents, logs: receipt.logs.filter(log => getAddress(log.address) === getAddress(scope.vault)) })
  const event = events.find(event => event.eventName === name && 'owner' in event.args && getAddress(event.args.owner) === getAddress(scope.owner) && 'amount' in event.args && event.args.amount === BigInt(reference.intent.amount!) && ('planId' in event.args && (action === 'createPlan' || event.args.planId === reference.intent.planId)))
  if (!event || !('planId' in event.args) || !('amount' in event.args)) throw new Error('Savings receipt event unavailable.')
  return {
    type: 'savings', savingsAction: action, receiptId: receipt.transactionHash, receiptHash: receipt.transactionHash,
    title: 'Savings', status: 'confirmed', eventId: event.args.planId, txHash: receipt.transactionHash,
    chain: 'Arc Testnet', payer: action === 'createPlan' ? scope.owner : scope.vault,
    recipient: action === 'createPlan' ? scope.vault : scope.owner,
    amount: formatUnits(event.args.amount, 6), asset: 'USDC', createdAt: Number(block.timestamp) * 1000,
    savingsRows: [
      { label: 'Type', value: action === 'createPlan' ? 'Savings deposit' : action === 'withdraw' ? 'Scheduled withdrawal' : 'Emergency withdrawal' },
      { label: 'Network', value: 'Arc Testnet' },
      { label: 'Wallet', value: scope.owner, mono: true },
      { label: 'Savings vault', value: scope.vault, mono: true },
      { label: 'Plan ID', value: event.args.planId, mono: true },
      ...(event.eventName === 'PlanCreated' ? [
        { label: 'Each release', value: `${formatUnits(event.args.releaseAmount, 6)} USDC` },
        { label: 'Schedule', value: `Every ${event.args.interval / 86400} days` },
      ] : []),
    ],
  }
}
