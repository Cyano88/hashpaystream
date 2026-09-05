import pg from 'pg'
import { inventoryLegacyFinancialStores } from '../api/financial-core-inventory.ts'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'

const { Pool } = pg
const databaseUrl = String(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()

function fail(code) {
  console.error(JSON.stringify({ ok: false, error: code }))
  process.exitCode = 1
}

function configuredKey(name, fallback) {
  const value = String(process.env[name] ?? fallback).trim()
  if (!value || value.length > 160) throw new Error('STORE_KEY_CONFIGURATION_INVALID')
  return value
}

function expectedStoreKeys() {
  return [
    configuredKey('HASHPAYSTREAM_ACCOUNT_STORE_KEY', 'hashpaystream:accounts:v1'),
    configuredKey('HASHPAYSTREAM_SERVICE_REQUEST_STORE_KEY', 'hashpaystream:service-requests:v1'),
    configuredKey('HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY', 'hashpaystream:human-agreement-owners:v1'),
    configuredKey('HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY', 'hashpaystream:upfront-agreement-owners:v1'),
    configuredKey('HASHPAYSTREAM_AGENT_AGREEMENT_STORE_KEY', 'hashpaystream:agent-agreement-owners:v1'),
    configuredKey('HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY', 'hashpaystream:arc-webhooks:v1'),
    configuredKey('HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY', 'hashpaystream:upfront-arc-webhooks:v1'),
    configuredKey('HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY', 'hashpaystream:agent-arc-webhooks:v1'),
    configuredKey('HASHPAYSTREAM_UPFRONT_STORE_KEY', 'hashpaystream:upfront-assessments:v1'),
    configuredKey('HASHPAYSTREAM_FUNDING_PARTNER_STORE_KEY', 'hashpaystream:funding-partners:v1'),
    configuredKey('HASHPAYSTREAM_AGENT_CREDENTIAL_STORE_KEY', 'hashpaystream:agent-credentials:v1'),
  ]
}

if (!databaseUrl) {
  fail('database_not_configured')
} else {
  const pool = new Pool({ ...renderDurableStoreConnectionConfig(databaseUrl), connectionTimeoutMillis: 10_000 })
  let client
  try {
    const expected = expectedStoreKeys()
    const unique = [...new Set(expected)]
    if (unique.length !== expected.length) throw new Error('STORE_KEY_DOMAINS_NOT_DISTINCT')
    client = await pool.connect()
    await client.query('begin transaction read only')
    const table = await client.query("select to_regclass('render_durable_kv') as relation")
    if (!table.rows[0]?.relation) throw new Error('LEGACY_STORE_UNAVAILABLE')
    const result = await client.query(
      'select store_key, value from render_durable_kv where store_key = any($1::text[]) order by store_key',
      [unique],
    )
    await client.query('commit')
    const report = inventoryLegacyFinancialStores(
      result.rows.map(row => ({ storeKey: String(row.store_key), value: row.value })),
      unique.length,
    )
    console.log(JSON.stringify({ ok: true, ...report }))
  } catch (reason) {
    if (client) await client.query('rollback').catch(() => undefined)
    const code = reason instanceof Error && /^[A-Z0-9_]{3,80}$/.test(reason.message)
      ? reason.message.toLowerCase()
      : 'financial_inventory_failed'
    fail(code)
  } finally {
    client?.release()
    await pool.end().catch(() => undefined)
  }
}
