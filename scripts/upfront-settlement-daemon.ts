import pg from 'pg'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.js'
import { createUpfrontSettlementDaemon } from '../api/upfront-settlement-daemon.js'
import { runUpfrontSettlementPass } from '../api/upfront-settlement-worker.js'

const { Pool } = pg
const databaseUrl = String(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const workerEnabled = String(process.env.HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED ?? '').trim().toLowerCase() === 'true'
const configuredInterval = Number(process.env.HASHPAYSTREAM_SETTLEMENT_WORKER_INTERVAL_MS ?? 30_000)
const intervalMs = Number.isFinite(configuredInterval)
  ? Math.min(300_000, Math.max(10_000, Math.floor(configuredInterval)))
  : 30_000

function fail(code: string): never {
  console.error(JSON.stringify({
    component: 'hashpaystream-upfront-settlement-daemon',
    event: 'startup_failed',
    code,
  }))
  process.exit(1)
}

if (!workerEnabled) fail('SETTLEMENT_WORKER_DISABLED')
if (!databaseUrl) fail('DATABASE_NOT_CONFIGURED')
if (String(process.env.HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED ?? '').trim().toLowerCase() !== 'true') {
  fail('AUTO_SETTLEMENT_DISABLED')
}

const pool = new Pool({
  ...renderDurableStoreConnectionConfig(databaseUrl),
  application_name: 'hashpaystream-settlement-worker',
  connectionTimeoutMillis: 10_000,
  max: 2,
})

const daemon = createUpfrontSettlementDaemon({
  acquireLease: async () => {
    const client = await pool.connect()
    try {
      const result = await client.query<{ acquired: boolean }>(
        'select pg_try_advisory_lock($1, $2) as acquired',
        [5_042_002, 1],
      )
      const acquired = result.rows[0]?.acquired === true
      if (!acquired) {
        client.release()
        return { acquired: false, release: async () => {} }
      }
      let released = false
      return {
        acquired: true,
        release: async () => {
          if (released) return
          released = true
          try {
            await client.query('select pg_advisory_unlock($1, $2)', [5_042_002, 1])
          } finally {
            client.release()
          }
        },
      }
    } catch (reason) {
      client.release()
      throw reason
    }
  },
  runPass: () => runUpfrontSettlementPass(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: timer => clearTimeout(timer),
  log: event => console.log(JSON.stringify(event)),
}, intervalMs)

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(JSON.stringify({
    component: 'hashpaystream-upfront-settlement-daemon',
    event: 'shutdown_started',
    signal,
  }))
  await daemon.stop().catch(() => undefined)
  await pool.end().catch(() => undefined)
  process.exit(0)
}

process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })

console.log(JSON.stringify({
  component: 'hashpaystream-upfront-settlement-daemon',
  event: 'worker_started',
  intervalMs,
}))
daemon.start()
