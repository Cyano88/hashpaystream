import pg from 'pg'
import { reconcileLegacyAgreementEvent, summarizeReconciliation } from '../api/financial-core-reconciliation.ts'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'

const { Pool } = pg
const CONFIRM = '--confirm-read-only-reconciliation'

function fail(code) {
  console.error(JSON.stringify({ ok: false, error: code }))
  process.exitCode = 1
}

function clean(value, maximum = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function configuration() {
  if (!process.argv.includes(CONFIRM)) throw new Error('READ_ONLY_CONFIRMATION_REQUIRED')
  const databaseUrl = clean(process.env.HASHPAYSTREAM_LEGACY_DATABASE_URL ?? process.env.DATABASE_URL, 2_000)
  if (!databaseUrl) throw new Error('DATABASE_NOT_CONFIGURED')
  const parsed = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL_INVALID')
  const base = new URL(clean(process.env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com'))
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('HASH_PAYLINK_URL_INVALID')
  const stores = [
    {
      key: clean(process.env.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY ?? 'hashpaystream:arc-webhooks:v1', 160),
      apiKey: clean(process.env.HASHPAYSTREAM_ARC_API_KEY, 240),
    },
    {
      key: clean(process.env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY ?? 'hashpaystream:upfront-arc-webhooks:v1', 160),
      apiKey: clean(process.env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 240),
    },
    {
      key: clean(process.env.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY ?? 'hashpaystream:agent-arc-webhooks:v1', 160),
      apiKey: clean(process.env.HASHPAYSTREAM_AGENT_ARC_API_KEY, 240),
    },
  ]
  if (new Set(stores.map(store => store.key)).size !== stores.length) throw new Error('EVENT_STORE_DOMAINS_NOT_DISTINCT')
  return { databaseUrl, base: base.origin, stores }
}

async function authoritativeAgreement(base, apiKey, agreementId) {
  if (!apiKey.startsWith('hpl_test_') || apiKey.length < 32) throw new Error('PROJECT_API_KEY_UNAVAILABLE')
  const response = await fetch(`${base}/api/v2/agreements?id=${encodeURIComponent(agreementId)}`, {
    cache: 'no-store',
    headers: { 'x-api-key': apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body?.agreement) throw new Error('AUTHORITATIVE_AGREEMENT_UNAVAILABLE')
  return body.agreement
}

async function main() {
  const config = configuration()
  const pool = new Pool({ ...renderDurableStoreConnectionConfig(config.databaseUrl), connectionTimeoutMillis: 10_000 })
  let client
  try {
    client = await pool.connect()
    await client.query('begin transaction read only')
    await client.query("set local statement_timeout = '30s'")
    const table = await client.query("select to_regclass('render_durable_kv') as relation")
    if (!table.rows[0]?.relation) throw new Error('LEGACY_STORE_UNAVAILABLE')
    const rows = await client.query(
      'select store_key, value from render_durable_kv where store_key = any($1::text[]) order by store_key',
      [config.stores.map(store => store.key)],
    )
    await client.query('commit')

    const values = new Map(rows.rows.map(row => [String(row.store_key), row.value]))
    const cache = new Map()
    const results = []
    const fetchCodes = {}
    for (const store of config.stores) {
      const value = values.get(store.key)
      const events = value?.schema === 1 && value.events && typeof value.events === 'object' ? value.events : {}
      for (const [id, raw] of Object.entries(events)) {
        const event = raw && typeof raw === 'object' && !Array.isArray(raw) ? { id, ...raw } : { id }
        const agreementId = clean(event.agreementId, 80)
        const cacheKey = store.key + '\0' + agreementId
        let snapshot
        if (cache.has(cacheKey)) snapshot = cache.get(cacheKey)
        else {
          try {
            snapshot = await authoritativeAgreement(config.base, store.apiKey, agreementId)
            cache.set(cacheKey, snapshot)
          } catch (reason) {
            const code = reason instanceof Error && /^[A-Z0-9_]{3,80}$/.test(reason.message)
              ? reason.message
              : 'AUTHORITATIVE_FETCH_FAILED'
            fetchCodes[code] = (fetchCodes[code] ?? 0) + 1
            cache.set(cacheKey, undefined)
          }
        }
        results.push(reconcileLegacyAgreementEvent(event, snapshot))
      }
    }
    const summary = summarizeReconciliation(results)
    console.log(JSON.stringify({
      ok: true,
      ...summary,
      storesExpected: config.stores.length,
      storesRead: rows.rowCount ?? 0,
      authoritativeAgreementsQueried: cache.size,
      fetchCodes: Object.fromEntries(Object.entries(fetchCodes).sort(([a], [b]) => a.localeCompare(b))),
      stagingWrites: 0,
      productionWrites: 0,
    }))
  } finally {
    if (client) {
      await client.query('rollback').catch(() => undefined)
      client.release()
    }
    await pool.end().catch(() => undefined)
  }
}

main().catch(reason => {
  const code = reason instanceof Error && /^[A-Z0-9_]{3,80}$/.test(reason.message)
    ? reason.message.toLowerCase()
    : 'financial_reconciliation_failed'
  fail(code)
})
