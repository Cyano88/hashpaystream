import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const harness = readFileSync(new URL('./verify-financial-core-postgres.mjs', import.meta.url), 'utf8')

for (const required of [
  '--confirm-rollback-only-postgres-check',
  '--allow-remote-staging-database',
  'HASHPAYSTREAM_DATABASE_ENVIRONMENT',
  "process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT",
  "await client.query('begin')",
  "await client.query('rollback')",
  "set local statement_timeout = '30s'",
  "set local lock_timeout = '5s'",
  "source.replace(/\\bhashpaystream\\b/g, schema)",
  'POSTED_LEDGER_ENTRY_IMMUTABLE',
  'LEDGER_TRANSACTION_UNBALANCED',
  'APPEND_ONLY_RECORD_IMMUTABLE',
  'connectionTimeoutMillis: 10_000',
  'TERMINAL_COMMAND_IMMUTABLE',
  'WEBHOOK_INBOX_IDENTITY_IMMUTABLE',
  'OUTBOX_IDENTITY_IMMUTABLE',
  'AGREEMENT_PROJECTION_SOURCE_CONFLICT',
  'DATABASE_OBJECT_COVERAGE_INCOMPLETE',
]) assert.ok(harness.includes(required), 'Missing rollback-only PostgreSQL guarantee: ' + required)

assert.doesNotMatch(harness, /client\.query\(['\"]commit['\"]\)/i)
assert.doesNotMatch(harness, /console\.(?:log|error)\([^\n]*(?:databaseUrl|connectionString)/)
assert.match(harness, /local = host === 'localhost'/)
assert.match(harness, /STAGING_DATABASE_ATTESTATION_REQUIRED/)
assert.match(harness, /rollbackOnly: true/)

console.log('HashPayStream rollback-only PostgreSQL harness safety checks passed.')
