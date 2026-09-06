import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'

const { Pool } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databaseUrl = String(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const confirmed = process.argv.includes('--confirm-rollback-only-postgres-check')
const allowRemote = process.argv.includes('--allow-remote-staging-database')

function fail(code) {
  console.error(JSON.stringify({ ok: false, error: code }))
  process.exitCode = 1
}

function databaseBoundary(value) {
  let parsed
  try { parsed = new URL(value) } catch { throw new Error('DATABASE_URL_INVALID') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL_INVALID')
  const host = parsed.hostname.toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!local) {
    if (!allowRemote) throw new Error('REMOTE_DATABASE_NOT_ALLOWED')
    if (String(process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT ?? '').trim().toLowerCase() !== 'staging') {
      throw new Error('STAGING_DATABASE_ATTESTATION_REQUIRED')
    }
  }
}

function migratedSql(schema) {
  const directory = path.join(root, 'api', 'migrations')
  const files = readdirSync(directory).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort()
  if (files.length < 2) throw new Error('FINANCIAL_CORE_MIGRATIONS_MISSING')
  return files.map(file => {
    const source = readFileSync(path.join(directory, file), 'utf8')
    const transformed = source.replace(/\bhashpaystream\b/g, schema)
    if (/\bhashpaystream\s*\./.test(transformed)) throw new Error('SCHEMA_ISOLATION_FAILED')
    return { file, sql: transformed }
  })
}

async function expectRejected(client, name, operation, message) {
  const savepoint = `check_${name.replace(/[^a-z0-9_]/g, '_')}`
  await client.query(`savepoint ${savepoint}`)
  let rejection
  try { await operation() } catch (reason) { rejection = reason }
  await client.query(`rollback to savepoint ${savepoint}`)
  await client.query(`release savepoint ${savepoint}`)
  if (!rejection) throw new Error('EXPECTED_DATABASE_REJECTION_MISSING')
  if (message && !String(rejection.message ?? '').includes(message)) {
    throw new Error('UNEXPECTED_DATABASE_REJECTION')
  }
}

async function exercise(client, schema) {
  const hashA = 'a'.repeat(64)
  const hashB = 'b'.repeat(64)
  const hashC = 'c'.repeat(64)
  const txHash = `0x${'1'.repeat(64)}`
  const blockA = `0x${'2'.repeat(64)}`
  const blockB = `0x${'3'.repeat(64)}`
  const asset = `0x${'4'.repeat(40)}`
  const contract = `0x${'5'.repeat(40)}`
  let checks = 0

  await client.query(`insert into ${schema}.ledger_accounts (account_id, identity_domain, owner_reference, network, asset_address, purpose) values ($1, 'system', $2, 'arc-mainnet', $3, 'external_clearing'), ($4, 'system', $5, 'arc-mainnet', $3, 'agreement_protected')`, ['account_external', 'system:external', asset, 'account_protected', 'agreement:example'])
  await client.query(`insert into ${schema}.ledger_transactions (posting_id, posting_key, request_hash, reference_type, reference_id, network, asset_address, occurred_at) values ('posting_balanced', 'agreement:example:funded', $1, 'agreement', 'agreement_example', 'arc-mainnet', $2, now())`, [hashA, asset])
  await client.query(`insert into ${schema}.ledger_entries (posting_id, line_number, account_id, side, amount_units, memo_code) values ('posting_balanced', 1, 'account_external', 'debit', 10000, 'agreement.funded'), ('posting_balanced', 2, 'account_protected', 'credit', 10000, 'agreement.funded')`)
  await client.query(`update ${schema}.ledger_transactions set status = 'posted', posted_at = now() where posting_id = 'posting_balanced'`)
  checks += 1
  await expectRejected(client, 'posted_entry', () => client.query(`update ${schema}.ledger_entries set amount_units = 9999 where posting_id = 'posting_balanced' and line_number = 2`), 'POSTED_LEDGER_ENTRY_IMMUTABLE')
  checks += 1

  await client.query(`insert into ${schema}.ledger_transactions (posting_id, posting_key, request_hash, reference_type, reference_id, network, asset_address, occurred_at) values ('posting_unbalanced', 'agreement:example:bad', $1, 'agreement', 'agreement_example', 'arc-mainnet', $2, now())`, [hashB, asset])
  await expectRejected(client, 'posted_entry_move', () => client.query(`update ${schema}.ledger_entries set posting_id = 'posting_unbalanced' where posting_id = 'posting_balanced' and line_number = 2`), 'POSTED_LEDGER_ENTRY_IMMUTABLE')
  checks += 1
  await client.query(`insert into ${schema}.ledger_entries (posting_id, line_number, account_id, side, amount_units, memo_code) values ('posting_unbalanced', 1, 'account_external', 'debit', 10000, 'agreement.funded'), ('posting_unbalanced', 2, 'account_protected', 'credit', 9999, 'agreement.funded')`)
  await expectRejected(client, 'unbalanced_posting', () => client.query(`update ${schema}.ledger_transactions set status = 'posted', posted_at = now() where posting_id = 'posting_unbalanced'`), 'LEDGER_TRANSACTION_UNBALANCED')
  checks += 1

  await client.query(`insert into ${schema}.domain_events (event_id, identity_domain, aggregate_type, aggregate_id, sequence, event_type, payload_hash, payload, occurred_at) values ('event_example', 'human', 'agreement', 'agreement_example', 1, 'agreement.funded', $1, '{}'::jsonb, now())`, [hashA])
  await expectRejected(client, 'domain_event_update', () => client.query(`update ${schema}.domain_events set event_type = 'agreement.refunded' where event_id = 'event_example'`), 'APPEND_ONLY_RECORD_IMMUTABLE')
  checks += 1

  await client.query(`insert into ${schema}.commands (command_id, identity_domain, command_type, aggregate_type, aggregate_id, idempotency_key, request_hash) values ('command_example', 'human', 'agreement.fund', 'agreement', 'agreement_example', 'agreement:example:fund', $1)`, [hashA])
  await client.query(`update ${schema}.commands set status = 'succeeded', result = '{}'::jsonb, completed_at = now() where command_id = 'command_example'`)
  await expectRejected(client, 'terminal_command', () => client.query(`update ${schema}.commands set result = '{"changed":true}'::jsonb where command_id = 'command_example'`), 'TERMINAL_COMMAND_IMMUTABLE')
  checks += 1

  await client.query(`insert into ${schema}.webhook_inbox (provider, delivery_id, event_type, payload_hash, payload) values ('hash_paylink', 'delivery_example', 'agreement.activated', $1, '{}'::jsonb)`, [hashA])
  await expectRejected(client, 'webhook_identity', () => client.query(`update ${schema}.webhook_inbox set payload_hash = $1 where provider = 'hash_paylink' and delivery_id = 'delivery_example'`, [hashB]), 'WEBHOOK_INBOX_IDENTITY_IMMUTABLE')
  checks += 1

  await client.query(`insert into ${schema}.outbox (outbox_id, topic, aggregate_type, aggregate_id, payload_hash, payload) values ('outbox_example', 'agreement.lifecycle', 'agreement', 'agreement_example', $1, '{}'::jsonb)`, [hashA])
  await expectRejected(client, 'outbox_identity', () => client.query(`update ${schema}.outbox set payload = '{"changed":true}'::jsonb where outbox_id = 'outbox_example'`), 'OUTBOX_IDENTITY_IMMUTABLE')
  checks += 1

  await client.query(`insert into ${schema}.service_requests (request_id, identity_domain, customer_reference, provider_reference, status, current_version, created_at, updated_at) values ('request_example', 'human', 'customer:example', 'provider:example', 'sent', 1, now(), now())`)
  await client.query(`insert into ${schema}.service_request_versions (request_id, version, proposed_by, terms_hash, amount_units, duration_seconds, cancellation_window_seconds, terms, created_at) values ('request_example', 1, 'customer', $1, 10000, 86400, 900, '{}'::jsonb, now())`, [hashA])
  await expectRejected(client, 'request_version', () => client.query(`update ${schema}.service_request_versions set amount_units = 9000 where request_id = 'request_example' and version = 1`), 'APPEND_ONLY_RECORD_IMMUTABLE')
  checks += 1
  await expectRejected(client, 'agreement_domain', () => client.query(`insert into ${schema}.agreements (agreement_id, identity_domain, request_id, checkout_mode, agreement_product, project_reference, network, chain_id, asset_address, protected_amount_units, accepted_terms_hash, status, created_at, updated_at) values ('agreement_wrong_domain', 'agent', 'request_example', 'agentic', 'direct', 'project:example', 'arc-mainnet', 5042002, $1, 10000, $2, 'active', now(), now())`, [asset, hashA]))
  checks += 1

  await client.query(`insert into ${schema}.agreements (agreement_id, identity_domain, request_id, checkout_mode, agreement_product, project_reference, network, chain_id, asset_address, protected_amount_units, accepted_terms_hash, status, created_at, updated_at) values ('agreement_example', 'human', 'request_example', 'human', 'direct', 'project:example', 'arc-mainnet', 5042002, $1, 10000, $2, 'active', now(), now())`, [asset, hashA])
  await client.query(`insert into ${schema}.agreement_projections (agreement_id, source_version, source_hash, projection, authoritative_observed_at) values ('agreement_example', 1, $1, '{}'::jsonb, now())`, [hashA])
  await expectRejected(client, 'projection_conflict', () => client.query(`update ${schema}.agreement_projections set source_hash = $1 where agreement_id = 'agreement_example'`, [hashB]), 'AGREEMENT_PROJECTION_SOURCE_CONFLICT')
  checks += 1

  await client.query(`insert into ${schema}.chain_observations (observation_id, network, chain_id, transaction_hash, log_index, observation_type, block_number, block_hash, contract_address, event_name, payload_hash, payload) values ('observation_a', 'arc-mainnet', 5042002, $1, 0, 'seen', 100, $2, $3, 'AgreementFunded', $4, '{}'::jsonb), ('observation_b', 'arc-mainnet', 5042002, $1, 0, 'seen', 101, $5, $3, 'AgreementFunded', $4, '{}'::jsonb)`, [txHash, blockA, contract, hashC, blockB])
  await expectRejected(client, 'chain_observation_delete', () => client.query(`delete from ${schema}.chain_observations where observation_id = 'observation_a'`), 'APPEND_ONLY_RECORD_IMMUTABLE')
  checks += 1

  await expectRejected(client, 'projection_payload', () => client.query(`update ${schema}.agreement_projections set projection = '{"changed":true}'::jsonb where agreement_id = 'agreement_example'`), 'AGREEMENT_PROJECTION_SOURCE_CONFLICT')
  await expectRejected(client, 'unposted_binding', () => client.query(`insert into ${schema}.agreement_receipt_bindings(observation_id,agreement_id) values ('observation_a','agreement_example')`), 'RECEIPT_BINDING_REQUIRES_POSTED_EVIDENCE')
  checks += 2

  const tables = await client.query(`select count(*)::integer as count from information_schema.tables where table_schema = $1`, [schema])
  const triggers = await client.query(`select count(*)::integer as count from information_schema.triggers where trigger_schema = $1`, [schema])
  if (Number(tables.rows[0]?.count) < 13 || Number(triggers.rows[0]?.count) < 10) throw new Error('DATABASE_OBJECT_COVERAGE_INCOMPLETE')
  return { checks, tables: Number(tables.rows[0].count), triggers: Number(triggers.rows[0].count) }
}

if (!databaseUrl) {
  fail('database_not_configured')
} else if (!confirmed) {
  fail('rollback_only_confirmation_required')
} else {
  const pool = new Pool({ ...renderDurableStoreConnectionConfig(databaseUrl), connectionTimeoutMillis: 10_000 })
  let client
  let transactionOpen = false
  try {
    databaseBoundary(databaseUrl)
    const schema = `hps_verify_${process.pid}_${randomBytes(6).toString('hex')}`
    client = await pool.connect()
    await client.query('begin')
    transactionOpen = true
    await client.query("set local statement_timeout = '30s'")
    await client.query("set local lock_timeout = '5s'")
    for (const migration of migratedSql(schema)) await client.query(migration.sql)
    const result = await exercise(client, schema)
    await client.query('rollback')
    transactionOpen = false
    console.log(JSON.stringify({ ok: true, rollbackOnly: true, migrations: migratedSql(schema).length, ...result }))
  } catch (reason) {
    if (client && transactionOpen) await client.query('rollback').catch(() => undefined)
    const code = reason instanceof Error && /^[A-Z0-9_]{3,80}$/.test(reason.message)
      ? reason.message.toLowerCase()
      : 'postgres_verification_failed'
    fail(code)
  } finally {
    client?.release()
    await pool.end().catch(() => undefined)
  }
}
