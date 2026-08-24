import { createHash } from 'node:crypto'
import pg from 'pg'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'

const { Pool } = pg
const databaseUrl = String(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const expectedFingerprint = String(process.env.HASHPAYSTREAM_RECOVERY_EXPECTED_FINGERPRINT ?? '').trim().toLowerCase()
const expectedStoreKeys = new Set([
  'hashpaystream:agent-arc-webhooks:v1',
  'hashpaystream:agent-credentials:v1',
  'hashpaystream:agreement-owners:v1',
  'hashpaystream:arc-webhooks:v1',
  'hashpaystream:upfront-assessments:v1',
  'hashpaystream:upfront-arc-webhooks:v1',
])

function fail() {
  console.error(JSON.stringify({ ok: false, error: 'database_recovery_audit_failed' }))
  process.exitCode = 1
}

if (!databaseUrl || (expectedFingerprint && !/^[a-f0-9]{64}$/.test(expectedFingerprint))) {
  fail()
} else {
  const pool = new Pool(renderDurableStoreConnectionConfig(databaseUrl))
  const client = await pool.connect()
  try {
    await client.query('begin transaction read only')
    const columns = await client.query(`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'render_durable_kv'
      order by ordinal_position
    `)
    const durable = await client.query('select store_key, value from render_durable_kv order by store_key')
    const fingerprint = createHash('sha256')
    for (const row of durable.rows) {
      fingerprint.update(row.store_key).update('\0').update(JSON.stringify(row.value)).update('\0')
    }
    const digest = fingerprint.digest('hex')
    const presentKeys = new Set(durable.rows.map(row => row.store_key))
    const schemaValid = JSON.stringify(columns.rows) === JSON.stringify([
      { column_name: 'store_key', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'value', data_type: 'jsonb', is_nullable: 'NO' },
      { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ])
    const missingExpectedStoreCount = [...expectedStoreKeys].filter(key => !presentKeys.has(key)).length
    const unexpectedStoreCount = [...presentKeys].filter(key => !expectedStoreKeys.has(key)).length
    const fingerprintMatches = expectedFingerprint ? digest === expectedFingerprint : null
    const ok = schemaValid
      && missingExpectedStoreCount === 0
      && unexpectedStoreCount === 0
      && fingerprintMatches !== false
    console.log(JSON.stringify({
      ok,
      schemaValid,
      durableStoreRows: durable.rowCount,
      missingExpectedStoreCount,
      unexpectedStoreCount,
      fingerprint: digest,
      fingerprintMatches,
    }))
    await client.query('rollback')
    if (!ok) process.exitCode = 1
  } catch {
    await client.query('rollback').catch(() => undefined)
    fail()
  } finally {
    client.release()
    await pool.end()
  }
}
