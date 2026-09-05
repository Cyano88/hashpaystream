import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reconcileLegacyAgreementEvent, summarizeReconciliation } from '../api/financial-core-reconciliation.ts'

const agreementId = 'agr_reconcile12345678'
const snapshot = {
  id: agreementId, status: 'completed', template: 'fixed_unlock', recipient: '0x' + '11'.repeat(20),
  durationSeconds: 86_400, cancellationWindowSeconds: 900,
  chain: {
    network: 'arc', chainId: 5_042_002, onchainAgreementId: '0x' + '22'.repeat(32),
    termsHash: '0x' + '33'.repeat(32), amountUsdcUnits: '10000', releasedUsdcUnits: '10000', remainingUsdcUnits: '0',
  },
}
const completed = reconcileLegacyAgreementEvent({
  id: 'evt_reconcile12345678', event: 'agreement.completed', agreementId, createdAt: '2026-09-05T10:00:00.000Z',
}, snapshot)
assert.equal(completed.projection, 'verified')
assert.equal(completed.ledger, 'blocked')
assert.deepEqual(completed.codes, ['CHAIN_RECEIPT_VERIFICATION_REQUIRED', 'CHAIN_TRANSACTION_MISSING'])
assert.match(completed.eventHash, /^[a-f0-9]{64}$/)
assert.equal(JSON.stringify(completed).includes(agreementId), false)

const conflict = reconcileLegacyAgreementEvent({
  id: 'evt_reconcile87654321', event: 'agreement.completed', agreementId, createdAt: '2026-09-05T10:00:00.000Z',
}, { ...snapshot, status: 'active', chain: { ...snapshot.chain, releasedUsdcUnits: '0', remainingUsdcUnits: '10000' } })
assert.equal(conflict.projection, 'blocked')
assert.ok(conflict.codes.includes('AUTHORITATIVE_STATE_CONFLICT'))

const candidateHashOnly = reconcileLegacyAgreementEvent({
  id: 'evt_reconcileabcdef12', event: 'agreement.activated', agreementId, createdAt: '2026-09-05T09:00:00.000Z',
  data: { transactionHash: '0x' + '44'.repeat(32) },
}, snapshot)
assert.equal(candidateHashOnly.ledger, 'blocked')
assert.deepEqual(candidateHashOnly.codes, ['CHAIN_RECEIPT_VERIFICATION_REQUIRED'])

const missing = reconcileLegacyAgreementEvent({
  id: 'evt_reconcilemissing1', event: 'agreement.expired', agreementId, createdAt: '2026-09-05T11:00:00.000Z',
})
assert.equal(missing.projection, 'blocked')
assert.deepEqual(missing.codes, ['AUTHORITATIVE_SNAPSHOT_MISSING'])

assert.deepEqual(summarizeReconciliation([completed, conflict, candidateHashOnly, missing]), {
  schema: 'hashpaystream.financial-core.reconciliation.v1', readOnly: true, eventCount: 4,
  projectionReady: 2, projectionBlocked: 2, ledgerReady: 0, ledgerBlocked: 4,
  events: {
    'agreement.activated': { verified: 1, blocked: 0 },
    'agreement.completed': { verified: 1, blocked: 1 },
    'agreement.expired': { verified: 0, blocked: 1 },
  },
  codes: {
    AUTHORITATIVE_SNAPSHOT_MISSING: 1, AUTHORITATIVE_STATE_CONFLICT: 1,
    CHAIN_RECEIPT_VERIFICATION_REQUIRED: 3, CHAIN_TRANSACTION_MISSING: 2,
  },
})

const runner = readFileSync(new URL('./reconcile-financial-core-data.mjs', import.meta.url), 'utf8')
for (const required of [
  '--confirm-read-only-reconciliation',
  'begin transaction read only',
  "set local statement_timeout = '30s'",
  'HASHPAYSTREAM_ARC_API_KEY',
  'HASHPAYSTREAM_UPFRONT_ARC_API_KEY',
  'HASHPAYSTREAM_AGENT_ARC_API_KEY',
  'stagingWrites: 0',
  'productionWrites: 0',
]) assert.ok(runner.includes(required), 'Missing reconciliation safety guarantee: ' + required)
assert.doesNotMatch(runner, /\b(?:insert|update|delete)\s+(?:into|from|hashpaystream|render_durable_kv)/i)
assert.doesNotMatch(runner, /console\.(?:log|error)\([^\n]*(?:databaseUrl|apiKey|agreementId)/)

console.log('HashPayStream financial-core reconciliation fail-closed checks passed.')
