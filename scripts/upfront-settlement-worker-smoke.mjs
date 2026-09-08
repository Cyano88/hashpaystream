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
const evidence = { chainId: 5042002, router: address(2), agreementHash, transactionHash: `0x${'77'.repeat(32)}` }
let settledMarks = 0
const base = {
  env: () => env,
  readStore: async () => store,
  position: async () => released,
  agreement: async () => ({ chain: { onchainAgreementId: agreementHash } }),
  recoveryStartBlock: async () => undefined,
  blockNumber: async () => 100n,
  saveCheckpoint: async (_key, _record, checkpoint) => { store.records.complete.fundingRequest.settlementCheckpoint = checkpoint },
  recover: async checkpoint => ({ checkpoint, evidence }),
  markSettled: async () => { settledMarks += 1 },
  sign: async () => signed,
  now: () => new Date('2026-08-30T12:00:00.000Z'),
  log: () => {},
}

let submissions = 0
const completed = await runUpfrontSettlementPass({ ...base, isSettled: async () => false, submit: async () => { submissions += 1; return evidence } })
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

const privateMessage = 'https://rpc.example/secret signed transaction 0x1234'
const rpcCause = Object.assign(new Error(privateMessage), { name: 'HttpRequestError' })
const wrappedRpc = Object.assign(new Error(privateMessage, { cause: rpcCause }), { name: 'TransactionExecutionError' })
const rpcFailure = await runUpfrontSettlementPass({ ...base, isSettled: async () => false, submit: async () => { throw wrappedRpc } })
assert.deepEqual(rpcFailure.codes, ['SETTLEMENT_RPC_HTTP_ERROR'])
assert.ok(!JSON.stringify(rpcFailure).includes(privateMessage))
const unknownFailure = await runUpfrontSettlementPass({ ...base, isSettled: async () => false, submit: async () => { throw new Error(privateMessage) } })
assert.deepEqual(unknownFailure.codes, ['SETTLEMENT_DEFERRED'])
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

// The real provider adapter must abort a stalled response and continue the pass.
const originalFetch = globalThis.fetch
const originalTimeout = AbortSignal.timeout
const timeoutRequests = []
let providerCalls = 0
let abortObserved = false
try {
  AbortSignal.timeout = milliseconds => {
    timeoutRequests.push(milliseconds)
    return originalTimeout.call(AbortSignal, 5)
  }
  globalThis.fetch = async (_url, options) => {
    providerCalls += 1
    assert.ok(options.signal instanceof AbortSignal)
    if (providerCalls === 1) return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { abortObserved = true; reject(options.signal.reason) }, { once: true })
    })
    return { ok: true, json: async () => ({ agreement: { chain: { onchainAgreementId: agreementHash } } }) }
  }
  const { agreement: _mockedAgreement, ...realAdapterBase } = base
  let watchdog
  const result = await Promise.race([
    runUpfrontSettlementPass({
      ...realAdapterBase,
      readStore: async () => ({ schema: 1, records: { first: store.records.complete, second: store.records.complete } }),
      isSettled: async () => false, submit: async () => evidence,
    }),
    new Promise((_resolve, reject) => { watchdog = setTimeout(() => reject(Error('Provider timeout failed to release the pass')), 1000) }),
  ]).finally(() => clearTimeout(watchdog))
  assert.equal(abortObserved, true)
  assert.deepEqual(timeoutRequests, [20_000, 20_000])
  assert.deepEqual(result, { eligible: 2, settled: 1, alreadySettled: 0, deferred: 1, codes: ['AGREEMENT_TIMEOUT'] })
} finally {
  globalThis.fetch = originalFetch
  AbortSignal.timeout = originalTimeout
}
console.log('Provider timeout defers only the affected agreement and continues settlement processing.')
// A chain success followed by a failed database write must recover without paying twice.
const recoveryStore = structuredClone(store)
delete recoveryStore.records.complete.fundingRequest.settlementCheckpoint
let chainSettled = false, payments = 0, writes = 0
const recoveryBase = {
  ...base, readStore: async () => recoveryStore,
  isSettled: async () => chainSettled,
  saveCheckpoint: async (_key, _record, checkpoint) => { recoveryStore.records.complete.fundingRequest.settlementCheckpoint = structuredClone(checkpoint) },
  submit: async () => { assert.ok(recoveryStore.records.complete.fundingRequest.settlementCheckpoint); payments++; chainSettled = true; return evidence },
  markSettled: async (_key, _record, proof) => {
    writes++; if (writes === 1) throw Error('DATABASE_UNAVAILABLE')
    recoveryStore.records.complete.fundingRequest.status = 'settled'
    recoveryStore.records.complete.fundingRequest.settlementEvidence = proof
  },
}
assert.deepEqual((await runUpfrontSettlementPass(recoveryBase)).codes, ['DATABASE_UNAVAILABLE'])
assert.equal(payments, 1)
assert.equal((await runUpfrontSettlementPass(recoveryBase)).alreadySettled, 1)
assert.equal(payments, 1)
assert.equal(recoveryStore.records.complete.fundingRequest.settlementEvidence.transactionHash, evidence.transactionHash)
assert.equal((await runUpfrontSettlementPass(recoveryBase)).eligible, 0)
const freshStore = structuredClone(store)
delete freshStore.records.complete.fundingRequest.settlementCheckpoint
const noCheckpoint = await runUpfrontSettlementPass({ ...base, readStore: async () => freshStore, isSettled: async () => false,
  saveCheckpoint: async () => { throw Error('DATABASE_UNAVAILABLE') }, submit: async () => { throw Error('MUST_NOT_BROADCAST') } })
assert.deepEqual(noCheckpoint.codes, ['DATABASE_UNAVAILABLE'])
const missingHistory = await runUpfrontSettlementPass({ ...base, readStore: async () => freshStore, isSettled: async () => true,
  submit: async () => { throw Error('MUST_NOT_BROADCAST') } })
assert.deepEqual(missingHistory.codes, ['SETTLEMENT_EVIDENCE_CHECKPOINT_MISSING'])
let progress
const pendingEvidence = await runUpfrontSettlementPass({ ...base, isSettled: async () => true,
  recover: async checkpoint => ({ checkpoint: { ...checkpoint, nextBlock: '198' } }),
  saveCheckpoint: async (_key, _record, checkpoint) => { progress = checkpoint.nextBlock },
  markSettled: async () => { throw Error('MUST_NOT_MARK_WITHOUT_PROOF') } })
assert.deepEqual(pendingEvidence.codes, ['SETTLEMENT_EVIDENCE_PENDING']); assert.equal(progress, '198')
console.log('Durable checkpoint, failed database write, single-payment recovery and evidence-pending checks passed.')

const externallySettled = structuredClone(freshStore)
let persistedStart
const seeded = await runUpfrontSettlementPass({ ...base, readStore: async () => externallySettled,
  isSettled: async () => true, recoveryStartBlock: async () => 50n,
  saveCheckpoint: async (_key, _record, checkpoint) => { persistedStart = checkpoint.nextBlock },
  recover: async checkpoint => { assert.equal(checkpoint.nextBlock, '50'); return { checkpoint, evidence } },
  submit: async () => { throw Error('MUST_NOT_BROADCAST') } })
assert.equal(seeded.alreadySettled, 1); assert.equal(persistedStart, '50')

// Another relayer settles while the provider call is in flight. Preserve the earlier search start.
const raceStore = structuredClone(freshStore)
let head = 100n
const raced = await runUpfrontSettlementPass({ ...base, readStore: async () => raceStore,
  blockNumber: async () => head, isSettled: async () => false,
  agreement: async () => { head = 200n; return { chain: { onchainAgreementId: agreementHash } } },
  saveCheckpoint: async (_key, _record, checkpoint) => { raceStore.records.complete.fundingRequest.settlementCheckpoint = checkpoint },
  submit: async () => undefined,
  recover: async checkpoint => { assert.ok(BigInt(checkpoint.nextBlock) <= 110n); return { checkpoint, evidence } },
})
assert.equal(raced.settled, 1)
console.log('Concurrent relayer settlement remains inside the durable recovery range.')
