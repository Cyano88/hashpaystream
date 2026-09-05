import assert from 'node:assert/strict'
import { indexVerifiedChainReceipt } from '../api/chain-receipt-index.ts'

const payload = {
  network: 'arc-testnet', chainId: 5_042_002,
  transactionHash: '0x' + '11'.repeat(32), blockNumber: '100', blockHash: '0x' + '22'.repeat(32),
  contractAddress: '0x' + '33'.repeat(20), tokenAddress: '0x' + '44'.repeat(20),
  eventName: 'AgreementActivated', identity: '0x' + '55'.repeat(32), minimumConfirmations: 3,
  eventAmounts: { amount: '10000' }, eventAddresses: {}, eventHashes: {}, transfers: [],
}
const receipt = {
  verified: true, codes: [], confirmations: '4', transactionHash: payload.transactionHash,
  blockNumber: payload.blockNumber, blockHash: payload.blockHash, logIndex: 2,
  payloadHash: 'a'.repeat(64), payload,
}

function client(mode = 'inserted') {
  const calls = []
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values })
      if (text.startsWith('insert into')) return { rowCount: mode === 'inserted' ? 1 : 0, rows: mode === 'inserted' ? [{ observation_id: 'x' }] : [] }
      return { rowCount: 1, rows: [{
        payload_hash: mode === 'conflict' ? 'b'.repeat(64) : receipt.payloadHash,
        transaction_hash: receipt.transactionHash, block_hash: receipt.blockHash,
        log_index: receipt.logIndex, observation_type: 'confirmed',
      }] }
    },
  }
}

const first = client()
const indexed = await indexVerifiedChainReceipt(first, receipt)
assert.equal(indexed.status, 'indexed')
assert.match(indexed.observationId, /^obs_[a-f0-9]{64}$/)
assert.equal(first.calls.length, 1)
assert.equal(first.calls[0].values.at(-1), JSON.stringify(payload))

const repeated = client('duplicate')
assert.equal((await indexVerifiedChainReceipt(repeated, receipt)).status, 'duplicate')
assert.equal(repeated.calls.length, 2)

await assert.rejects(() => indexVerifiedChainReceipt(client(), { ...receipt, verified: false, codes: ['TOKEN_TRANSFER_MISSING'] }), /CHAIN_RECEIPT_NOT_VERIFIED/)
await assert.rejects(() => indexVerifiedChainReceipt(client(), { ...receipt, logIndex: undefined }), /CHAIN_RECEIPT_LOG_INDEX_INVALID/)
await assert.rejects(() => indexVerifiedChainReceipt(client('conflict'), receipt), /CHAIN_OBSERVATION_IDEMPOTENCY_CONFLICT/)

console.log('HashPayStream confirmed chain receipt idempotency checks passed.')
