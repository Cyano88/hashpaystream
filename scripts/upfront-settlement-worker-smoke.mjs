import assert from 'node:assert/strict'
import { privateKeyToAccount } from 'viem/accounts'
import { runUpfrontSettlementPass, startUpfrontSettlementWorker } from '../api/upfront-settlement-worker.ts'

const repaymentKey = `0x${'41'.repeat(32)}`
const positionId = `0x${'11'.repeat(32)}`
const agreementHash = `0x${'22'.repeat(32)}`
const address = index => `0x${String(index).padStart(40, '0')}`
const env = {
  HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED: 'true',
  HASHPAYSTREAM_UPFRONT_STORE_KEY: 'test:settlement-worker',
  HASHPAYSTREAM_UPFRONT_ARC_API_KEY: `hpl_test_${'a'.repeat(40)}`,
  HASHPAYSTREAM_HASH_PAYLINK_BASE_URL: 'https://hashpaylink.example',
  HASHPAYSTREAM_XLAYER_RPC_URL: 'https://xlayer.example',
  HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: address(1),
  HASHPAYSTREAM_ARC_RPC_URL: 'https://arc.example',
  HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS: address(2),
  HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY: repaymentKey,
  HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER: privateKeyToAccount(repaymentKey).address,
}
const store = {
  schema: 1,
  records: {
    complete: {
      ownerReference: 'provider', requestHash: `sha256:${'a'.repeat(64)}`, agreementId: 'agr_settlementworker1234', status: 'completed', createdAt: new Date().toISOString(), request: {},
      fundingRequest: { status: 'pending', fundingTerms: { message: { offerHash: positionId } } },
    },
  },
}
const released = {
  positionId, funder: address(3), repaymentRecipient: address(3), provider: address(4), providerArcRecipient: address(5), platformTreasury: address(6),
  termsHash: `0x${'33'.repeat(32)}`, fundingTermsHash: `0x${'44'.repeat(32)}`, intelligenceCommitment: `0x${'55'.repeat(32)}`, arcAgreementHash: agreementHash,
  protectedAmount: '10000', advanceAmount: '3000', funderRepaymentAmount: '3024', platformFeeAmount: '106', protectionDeadline: 2_000_000_000, status: 'Released',
}
const signed = { message: { arcAgreementHash: agreementHash, funderAmount: '3024', providerAmount: '6870', treasuryAmount: '106' }, signature: `0x${'66'.repeat(65)}` }
let settledMarks = 0
const base = {
  env: () => env,
  readStore: async () => store,
  position: async () => released,
  agreement: async () => ({ chain: { onchainAgreementId: agreementHash } }),
  markSettled: async () => { settledMarks += 1 },
  sign: async () => signed,
  now: () => new Date('2026-08-30T12:00:00.000Z'),
  log: () => {},
}

let submissions = 0
const completed = await runUpfrontSettlementPass({ ...base, isSettled: async () => false, submit: async () => { submissions += 1 } })
assert.deepEqual(completed, { eligible: 1, settled: 1, alreadySettled: 0, deferred: 0, codes: [] })
assert.equal(submissions, 1)
assert.equal(settledMarks, 1)

const replay = await runUpfrontSettlementPass({ ...base, isSettled: async () => true, submit: async () => { throw new Error('must not submit') } })
assert.deepEqual(replay, { eligible: 1, settled: 0, alreadySettled: 1, deferred: 0, codes: [] })
assert.equal(settledMarks, 2)

const mismatch = await runUpfrontSettlementPass({ ...base, agreement: async () => ({ chain: { onchainAgreementId: `0x${'99'.repeat(32)}` } }), isSettled: async () => false, submit: async () => { throw new Error('must not submit') } })
assert.deepEqual(mismatch, { eligible: 1, settled: 0, alreadySettled: 0, deferred: 1, codes: ['ARC_AGREEMENT_MISMATCH'] })

const noGas = await runUpfrontSettlementPass({ ...base, isSettled: async () => false, submit: async () => { throw new Error('RELAYER_GAS_UNAVAILABLE') } })
assert.deepEqual(noGas, { eligible: 1, settled: 0, alreadySettled: 0, deferred: 1, codes: ['RELAYER_GAS_UNAVAILABLE'] })

let readWhileDisabled = false
const disabled = await runUpfrontSettlementPass({ ...base, env: () => ({ ...env, HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED: 'false' }), readStore: async () => { readWhileDisabled = true; return store } })
assert.deepEqual(disabled, { eligible: 0, settled: 0, alreadySettled: 0, deferred: 0, codes: [] })
assert.equal(readWhileDisabled, false)

let releaseFirstPass
let secondPassStarted
const firstPassGate = new Promise(resolve => { releaseFirstPass = resolve })
const secondPass = new Promise(resolve => { secondPassStarted = resolve })
let passStarts = 0
const scheduler = startUpfrontSettlementWorker({
  ...base,
  readStore: async () => {
    passStarts += 1
    if (passStarts === 1) await firstPassGate
    if (passStarts === 2) secondPassStarted()
    return { schema: 1, records: {} }
  },
}, 60_000)
await new Promise(resolve => setImmediate(resolve))
assert.equal(passStarts, 1)
scheduler.trigger()
scheduler.trigger()
releaseFirstPass()
await secondPass
scheduler.stop()
assert.equal(passStarts, 2)

console.log('HashPayStream automatic settlement idempotency and retry checks passed.')
