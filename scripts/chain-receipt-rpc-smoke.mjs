import assert from 'node:assert/strict'
import { firstMatchingBlock, loadTransactionReceipt } from './chain-receipt-rpc.mjs'
const hash = '0x' + '11'.repeat(32)
const receipt = { transactionHash: hash }
const missing = { getTransactionReceipt: async () => { throw new Error('TransactionReceiptNotFoundError') } }
let fallbackCalls = 0
const available = { getTransactionReceipt: async () => { fallbackCalls++; return receipt } }
assert.equal(await loadTransactionReceipt(missing, hash, [available]), receipt)
assert.equal(fallbackCalls, 1)
assert.equal(await loadTransactionReceipt(available, hash, [missing]), receipt)
await assert.rejects(loadTransactionReceipt(missing, hash, [missing]), /TRANSACTION_RECEIPT_UNAVAILABLE_ALL_PROVIDERS/)
const wrong = { getTransactionReceipt: async () => ({ transactionHash: '0x' + '22'.repeat(32) }) }
await assert.rejects(loadTransactionReceipt(wrong, hash, [available]), /TRANSACTION_HASH_MISMATCH/)
assert.equal(fallbackCalls, 2)
console.log('Historical receipt fallback and transaction identity checks passed.')
assert.equal(await firstMatchingBlock(async block => block >= 173n, 100n, 250n), 173n)
assert.equal(await firstMatchingBlock(async () => true, 100n, 250n), 100n)
assert.equal(await firstMatchingBlock(async block => block === 250n, 100n, 250n), 250n)
await assert.rejects(firstMatchingBlock(async () => false, 100n, 250n), /HISTORICAL_POSITION_STATE_UNAVAILABLE/)
await assert.rejects(firstMatchingBlock(async () => { throw new Error('ARCHIVE_UNAVAILABLE') }, 100n, 250n), /ARCHIVE_UNAVAILABLE/)
console.log('Historical monotonic position block boundary checks passed.')