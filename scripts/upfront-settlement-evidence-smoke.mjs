import assert from 'node:assert/strict'
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from 'viem'
import { repaymentSettledEvent, verifySettlementReceipt, recoverSettlementEvidence } from '../api/upfront-settlement-evidence.ts'
import { settlementTransactionUrl } from '../src/lib/settlementEvidence.ts'
const hash = n => `0x${n.repeat(64)}`
const address = n => `0x${n.repeat(40)}`
const router = address('1'), agreementHash = hash('2'), tx = hash('3'), blockHash = hash('4')
const log = { address: router, removed: false, transactionHash: tx, logIndex: 2,
  topics: encodeEventTopics({ abi: [repaymentSettledEvent], eventName: 'RepaymentSettled', args: { arcAgreementHash: agreementHash, arcTermsHash: hash('5'), funder: address('6') } }),
  data: encodeAbiParameters(parseAbiParameters('address,address,uint256,uint256,uint256'), [address('7'), address('8'), 3024n, 6870n, 106n]) }
const receipt = { status: 'success', transactionHash: tx, blockNumber: 130n, blockHash, logs: [log] }
const client = { getChainId: async () => 5042002, getTransactionReceipt: async () => receipt,
  getBlock: async () => ({ hash: blockHash, timestamp: 1700000000n }), getBlockNumber: async () => 400n,
  getLogs: async () => [log] }
const proof = await verifySettlementReceipt(client, router, agreementHash, tx)
assert.equal(proof.transactionHash, tx); assert.equal(proof.chainId, 5042002)
assert.equal(proof.funderAmount, '3024'); assert.equal(proof.timestamp, 1700000000000)
assert.equal(settlementTransactionUrl(proof), `https://testnet.arcscan.app/tx/${tx}`)
assert.equal(settlementTransactionUrl({ ...proof, chainId: 196 }), '')
assert.equal(settlementTransactionUrl({ ...proof, transactionHash: 'bad' }), '')
for (const [overrides, code] of [
  [{ getChainId: async () => 196 }, 'CHAIN_MISMATCH'],
  [{ getBlockNumber: async () => 130n }, 'CONFIRMATIONS_PENDING'],
  [{ getTransactionReceipt: async () => ({ ...receipt, status: 'reverted' }) }, 'RECEIPT_INVALID'],
  [{ getTransactionReceipt: async () => ({ ...receipt, transactionHash: hash('9') }) }, 'RECEIPT_INVALID'],
  [{ getTransactionReceipt: async () => ({ ...receipt, logs: [{ ...log, address: address('9') }] }) }, 'EVENT_INVALID'],
  [{ getTransactionReceipt: async () => ({ ...receipt, logs: [{ ...log, removed: true }] }) }, 'EVENT_INVALID'],
  [{ getTransactionReceipt: async () => ({ ...receipt, logs: [log, log] }) }, 'EVENT_INVALID'],
  [{ getBlock: async () => ({ hash: hash('9'), timestamp: 1n }) }, 'BLOCK_CHANGED'],
]) await assert.rejects(verifySettlementReceipt({ ...client, ...overrides }, router, agreementHash, tx), new RegExp(code))
await assert.rejects(verifySettlementReceipt(client, router, hash('9'), tx), /EVENT_INVALID/)
const checkpoint = { chainId: 5042002, router, agreementHash, nextBlock: '100' }
assert.equal((await recoverSettlementEvidence(client, checkpoint)).evidence.transactionHash, tx)
let query
const pending = await recoverSettlementEvidence({ ...client, getLogs: async q => { query = q; return [] } }, checkpoint)
assert.equal(query.fromBlock, 100n); assert.equal(query.toBlock, 199n)
assert.equal(query.address, router); assert.equal(query.args.arcAgreementHash, agreementHash)
assert.equal(pending.checkpoint.nextBlock, '198'); assert.equal(pending.evidence, undefined)
await assert.rejects(recoverSettlementEvidence({ ...client, getLogs: async () => { throw Error('RPC_UNAVAILABLE') } }, checkpoint), /RPC_UNAVAILABLE/)
assert.equal(checkpoint.nextBlock, '100')
console.log('Settlement receipt identity, origin, reorg, exact event, and bounded recovery checks passed.')
