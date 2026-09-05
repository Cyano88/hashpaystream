import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  postLedgerTransaction,
  validateLedgerAccount,
  validateLedgerPosting,
} from '../api/financial-core.ts'

const asset = '0xB6CEceAB302E2E4948951eE7843FC24E92933061'
const occurredAt = '2026-09-03T18:00:00.000Z'
const postingInput = {
  postingId: 'post_agreement_funded_001',
  postingKey: 'agreement:agr_example_001:funded',
  referenceType: 'agreement',
  referenceId: 'agr_example_001',
  network: 'arc-mainnet',
  assetAddress: asset,
  occurredAt,
  entries: [
    { lineNumber: 1, accountId: 'account_external_clearing', side: 'debit', amountUnits: '10000', memoCode: 'agreement.funded' },
    { lineNumber: 2, accountId: 'account_agreement_protected', side: 'credit', amountUnits: '10000', memoCode: 'agreement.funded' },
  ],
}

const account = validateLedgerAccount({
  accountId: 'account_agreement_protected',
  identityDomain: 'system',
  ownerReference: 'agreement:agr_example_001',
  network: 'ARC-MAINNET',
  assetAddress: asset,
  purpose: 'agreement_protected',
})
assert.equal(account.network, 'arc-mainnet')
assert.equal(account.assetAddress, asset.toLowerCase())

const posting = validateLedgerPosting(postingInput)
assert.equal(posting.debitUnits, 10_000n)
assert.equal(posting.creditUnits, 10_000n)
assert.match(posting.requestHash, /^[a-f0-9]{64}$/)
assert.equal(validateLedgerPosting({ ...postingInput, entries: [...postingInput.entries] }).requestHash, posting.requestHash)

assert.throws(
  () => validateLedgerPosting({
    ...postingInput,
    entries: [
      postingInput.entries[0],
      { ...postingInput.entries[1], amountUnits: '9999' },
    ],
  }),
  /LEDGER_POSTING_UNBALANCED/,
)
assert.throws(
  () => validateLedgerPosting({
    ...postingInput,
    entries: [
      postingInput.entries[0],
      { ...postingInput.entries[1], lineNumber: 1 },
    ],
  }),
  /LEDGER_LINE_NUMBER_INVALID/,
)
assert.throws(
  () => validateLedgerPosting({
    ...postingInput,
    entries: [
      { ...postingInput.entries[0], amountUnits: '0' },
      { ...postingInput.entries[1], amountUnits: '0' },
    ],
  }),
  /LEDGER_AMOUNT_INVALID/,
)

function successfulClient() {
  const calls = []
  return {
    calls,
    async query(text, values = []) {
      calls.push({ text, values })
      if (text.includes('returning posting_id')) return { rowCount: 1, rows: [{ posting_id: postingInput.postingId }] }
      return { rowCount: 1, rows: [] }
    },
  }
}

const success = successfulClient()
const posted = await postLedgerTransaction(success, postingInput)
assert.equal(posted.status, 'posted')
assert.equal(success.calls[0].text, 'begin')
assert.equal(success.calls.at(-1).text, 'commit')
assert.equal(success.calls.filter(call => call.text.includes('ledger_entries')).length, 2)
assert.equal(success.calls.filter(call => call.text.includes("set status = 'posted'")).length, 1)

const duplicateCalls = []
const duplicateClient = {
  async query(text) {
    duplicateCalls.push(text)
    if (text.includes('returning posting_id')) return { rowCount: 0, rows: [] }
    if (text.includes('select posting_id')) {
      return { rowCount: 1, rows: [{ posting_id: postingInput.postingId, request_hash: posting.requestHash, status: 'posted' }] }
    }
    return { rowCount: 1, rows: [] }
  },
}
const duplicate = await postLedgerTransaction(duplicateClient, postingInput)
assert.equal(duplicate.status, 'duplicate')
assert.equal(duplicateCalls.at(-1), 'commit')
assert.equal(duplicateCalls.some(call => call.includes('ledger_entries')), false)

const conflictCalls = []
const conflictClient = {
  async query(text) {
    conflictCalls.push(text)
    if (text.includes('returning posting_id')) return { rowCount: 0, rows: [] }
    if (text.includes('select posting_id')) {
      return { rowCount: 1, rows: [{ posting_id: postingInput.postingId, request_hash: '0'.repeat(64), status: 'posted' }] }
    }
    return { rowCount: 1, rows: [] }
  },
}
await assert.rejects(() => postLedgerTransaction(conflictClient, postingInput), /LEDGER_IDEMPOTENCY_CONFLICT/)
assert.equal(conflictCalls.at(-1), 'rollback')

const stateConflictCalls = []
const stateConflictClient = {
  async query(text) {
    stateConflictCalls.push(text)
    if (text.includes('returning posting_id')) {
      return { rowCount: 1, rows: [{ posting_id: postingInput.postingId }] }
    }
    if (text.includes("set status = 'posted'")) return { rowCount: 0, rows: [] }
    return { rowCount: 1, rows: [] }
  },
}
await assert.rejects(
  () => postLedgerTransaction(stateConflictClient, postingInput),
  /LEDGER_POSTING_STATE_CONFLICT/,
)
assert.equal(stateConflictCalls.at(-1), 'rollback')

const sql = readFileSync(new URL('../api/migrations/001_financial_core.sql', import.meta.url), 'utf8')
for (const required of [
  'hashpaystream.domain_events',
  'hashpaystream.commands',
  'hashpaystream.webhook_inbox',
  'hashpaystream.outbox',
  'hashpaystream.ledger_accounts',
  'hashpaystream.ledger_transactions',
  'hashpaystream.ledger_entries',
  'LEDGER_TRANSACTION_UNBALANCED',
  'LEDGER_ACCOUNT_ASSET_MISMATCH',
  'POSTED_LEDGER_TRANSACTION_IMMUTABLE',
  'POSTED_LEDGER_ENTRY_IMMUTABLE',
  'POSTED_LEDGER_ACCOUNT_IMMUTABLE',
  'payload_hash character(64)',
  "jsonb_typeof(payload) = 'object'",
  'hashpaystream.webhook_inbox',
]) assert.ok(sql.includes(required), 'Missing financial-core invariant: ' + required)
assert.match(sql, /unique \(identity_domain, command_type, idempotency_key\)/)
assert.match(sql, /unique \(identity_domain, aggregate_type, aggregate_id, sequence\)/)
assert.match(sql, /primary key \(provider, delivery_id\)/)
assert.match(sql, /amount_units numeric\(78, 0\) not null check \(amount_units > 0\)/)

const runner = readFileSync(new URL('./migrate-financial-core.mjs', import.meta.url), 'utf8')
assert.match(runner, /--confirm-additive-financial-core-migration/)
assert.match(runner, /--allow-remote-staging-database/)
assert.match(runner, /HASHPAYSTREAM_DATABASE_ENVIRONMENT/)
assert.match(runner, /REMOTE_DATABASE_NOT_ALLOWED/)
assert.match(runner, /STAGING_DATABASE_ATTESTATION_REQUIRED/)
assert.match(runner, /STAGING_DATABASE_NAME_REQUIRED/)
assert.match(runner, /pg_advisory_xact_lock/)
assert.match(runner, /MIGRATION_CHECKSUM_MISMATCH/)
assert.match(runner, /connectionTimeoutMillis: 10_000/)
assert.match(runner, /begin/)
assert.match(runner, /rollback/)
assert.match(runner, /let client/)

console.log('HashPayStream additive financial-core and balanced-ledger checks passed.')
