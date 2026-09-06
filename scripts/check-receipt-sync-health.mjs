import pg from 'pg'
import { workflowDatabaseBoundary } from './receipt-workflow-source.mjs'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'
import { receiptSyncMonitor } from '../api/receipt-sync-health.ts'
async function main() {
  if (!process.argv.includes('--confirm-read-only-sync-health')) throw Error('READ_ONLY_SYNC_HEALTH_CONFIRMATION_REQUIRED')
  const target = workflowDatabaseBoundary()
  const pool = new pg.Pool({ ...renderDurableStoreConnectionConfig(target.toString()), connectionTimeoutMillis: 10000, query_timeout: 15000 })
  let client
  try {
    client = await pool.connect()
    await client.query('begin read only')
    if ((await client.query('select current_database() as name')).rows[0].name !== decodeURIComponent(target.pathname.slice(1))) throw Error('ACTUAL_DATABASE_NAME_MISMATCH')
    const row = (await client.query('select state,verified_at,updated_at from hashpaystream.receipt_sync_health where singleton=true')).rows[0]
    const acquired = (await client.query("select pg_try_advisory_xact_lock(hashtext('hashpaystream.receipt-sync.v1')) as acquired")).rows[0].acquired
    const health = receiptSyncMonitor(row, !acquired)
    await client.query('rollback')
    console.log(JSON.stringify({ component: 'receipt-sync-health', ...health, productionWrites: 0 }))
    if (!health.ok) process.exitCode = 1
  } finally { client?.release(); await pool.end() }
}
main().catch(e => { console.error(JSON.stringify({ ok: false, error: /^[A-Z0-9_]+$/.test(e.message) ? e.message : 'SYNC_HEALTH_CHECK_FAILED', productionWrites: 0 })); process.exitCode = 1 })
