import { decodeEventLog, parseAbiItem, type Address, type Hex, type PublicClient } from 'viem'
import type { SettlementCheckpoint, SettlementEvidence } from '../src/lib/settlementEvidence.js'

export const repaymentSettledEvent = parseAbiItem('event RepaymentSettled(bytes32 indexed arcAgreementHash, bytes32 indexed arcTermsHash, address indexed funder, address provider, address treasury, uint256 funderAmount, uint256 providerAmount, uint256 treasuryAmount)')
type EvidenceClient = Pick<PublicClient, 'getChainId' | 'getBlockNumber' | 'getLogs' | 'getTransactionReceipt' | 'getBlock'>

export async function verifySettlementReceipt(client: EvidenceClient, router: Address, agreementHash: Hex, transactionHash: Hex): Promise<SettlementEvidence> {
  if (await client.getChainId() !== 5042002) throw Error('SETTLEMENT_EVIDENCE_CHAIN_MISMATCH')
  const receipt = await client.getTransactionReceipt({ hash: transactionHash })
  if (receipt.status !== 'success' || receipt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) throw Error('SETTLEMENT_EVIDENCE_RECEIPT_INVALID')
  const matches = receipt.logs.flatMap(log => {
    if (log.address.toLowerCase() !== router.toLowerCase() || log.removed) return []
    try {
      const event = decodeEventLog({ abi: [repaymentSettledEvent], data: log.data, topics: log.topics, strict: true })
      return event.args.arcAgreementHash.toLowerCase() === agreementHash.toLowerCase() ? [{ log, args: event.args }] : []
    } catch { return [] }
  })
  if (matches.length !== 1) throw Error('SETTLEMENT_EVIDENCE_EVENT_INVALID')
  if (await client.getBlockNumber() < receipt.blockNumber + 1n) throw Error('SETTLEMENT_EVIDENCE_CONFIRMATIONS_PENDING')
  const block = await client.getBlock({ blockNumber: receipt.blockNumber })
  if (block.hash !== receipt.blockHash) throw Error('SETTLEMENT_EVIDENCE_BLOCK_CHANGED')
  const { log, args } = matches[0]
  if (log.logIndex === null) throw Error('SETTLEMENT_EVIDENCE_EVENT_INVALID')
  return { chainId: 5042002, router, agreementHash, transactionHash, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
    logIndex: log.logIndex, timestamp: Number(block.timestamp) * 1000,
    funderAmount: args.funderAmount.toString(), providerAmount: args.providerAmount.toString(), treasuryAmount: args.treasuryAmount.toString() }
}

// One bounded page per pass; save progress only after all RPC verification succeeds.
export async function recoverSettlementEvidence(client: EvidenceClient, checkpoint: SettlementCheckpoint): Promise<{ evidence?: SettlementEvidence; checkpoint: SettlementCheckpoint }> {
  if (checkpoint.chainId !== 5042002 || await client.getChainId() !== 5042002) throw Error('SETTLEMENT_EVIDENCE_CHAIN_MISMATCH')
  if (!/^\d+$/.test(checkpoint.nextBlock)) throw Error('SETTLEMENT_EVIDENCE_CHECKPOINT_INVALID')
  const head = await client.getBlockNumber()
  const fromBlock = BigInt(checkpoint.nextBlock)
  if (fromBlock > head) return { checkpoint }
  const toBlock = fromBlock + 99n < head ? fromBlock + 99n : head
  const logs = await client.getLogs({ address: checkpoint.router, event: repaymentSettledEvent, args: { arcAgreementHash: checkpoint.agreementHash }, fromBlock, toBlock, strict: true })
  const log = logs.find(item => !item.removed && item.transactionHash)
  if (log?.transactionHash) return { checkpoint, evidence: await verifySettlementReceipt(client, checkpoint.router, checkpoint.agreementHash, log.transactionHash) }
  // Recheck a small overlap on the next page to tolerate a short chain reorganization.
  return { checkpoint: { ...checkpoint, nextBlock: (toBlock >= fromBlock + 2n ? toBlock - 1n : fromBlock).toString() } }
}
