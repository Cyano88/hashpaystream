import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./backfill-chain-receipts.mjs', import.meta.url), 'utf8')

for (const guard of [
  "process.argv.includes('--confirm-read-only-chain-audit')",
  "process.argv.includes('--confirm-staging-chain-index')",
  "source.value === target.value || authoritative.value === target.value",
  'STAGING_DATABASE_ATTESTATION_REQUIRED',
  'REMOTE_STAGING_DATABASE_NOT_ALLOWED',
  'STAGING_DATABASE_NAME_REQUIRED',
  'verifyConfirmedReceipt',
  'indexVerifiedChainReceipt',
  'settledAgreements',
  'transactionHashes',
  'config.write && Object.keys(blocked).length === 0',
  'STAGING_IDEMPOTENCY_CHECK_FAILED',
  "productionWrites: 0",
  "status: 'not_run', reason: 'receipt_evidence_incomplete'",
]) assert.ok(source.includes(guard), `Missing backfill safety guard: ${guard}`)

assert.match(source, /secondPass\.indexed !== 0 \|\| secondPass\.duplicate !== verified\.length/)
assert.doesNotMatch(source, /delete\s+from|truncate\s+table|drop\s+table/i)

console.log('HashPayStream staging-only receipt backfill safety checks passed.')
