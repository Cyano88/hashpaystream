import pg from 'pg'
import { renderDurableStoreConnectionConfig } from './durable-store.js'
import { createUpfrontSettlementDaemon } from './upfront-settlement-daemon.js'
import { runUpfrontSettlementPass, upfrontSettlementWorkerConfiguration } from './upfront-settlement-worker.js'

type LeaseClient = {
  query: (sql: string, values: number[]) => Promise<{ rows: Array<{ acquired?: boolean }> }>
  release: (destroy?: boolean) => void
}
type LeasePool = { connect: () => Promise<LeaseClient>; end: () => Promise<void> }
type Dependencies = {
  pool: (url: string, env: NodeJS.ProcessEnv) => LeasePool
  runPass: typeof runUpfrontSettlementPass
  validate: typeof upfrontSettlementWorkerConfiguration
  log: (event: Record<string, unknown>) => void
}
const defaults: Dependencies = {
  pool: (url, env) => new pg.Pool({ ...renderDurableStoreConnectionConfig(url, env),
    application_name: 'hashpaystream-settlement-worker', connectionTimeoutMillis: 10_000,
    query_timeout: 10_000, max: 2 }),
  runPass: runUpfrontSettlementPass,
  validate: upfrontSettlementWorkerConfiguration,
  log: event => console.log(JSON.stringify(event)),
}

// Shares the standalone daemon's advisory lock, including during rolling deploys.
export function createUpfrontSettlementRuntime(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Dependencies> = {}) {
  const enabled = String(env.HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED ?? '').trim().toLowerCase() === 'true'
  if (!enabled) return { enabled: false, start() {}, trigger() {}, stop: async () => {} }
  const dependencies = { ...defaults, ...overrides }
  const snapshot = { ...env }
  if (!dependencies.validate(snapshot).enabled) throw new Error('AUTO_SETTLEMENT_DISABLED')
  const databaseUrl = String(snapshot.DATABASE_URL ?? snapshot.POSTGRES_URL ?? '').trim()
  if (!databaseUrl) throw new Error('DATABASE_NOT_CONFIGURED')
  const configured = Number(snapshot.HASHPAYSTREAM_SETTLEMENT_WORKER_INTERVAL_MS ?? 30_000)
  const intervalMs = Number.isFinite(configured) ? Math.min(300_000, Math.max(10_000, Math.floor(configured))) : 30_000
  const pool = dependencies.pool(databaseUrl, snapshot)
  const log = (event: Record<string, unknown>) => { try { dependencies.log(event) } catch {} }
  const daemon = createUpfrontSettlementDaemon({
    acquireLease: async () => {
      const client = await pool.connect()
      let released = false
      const releaseClient = (destroy = false) => { if (!released) { released = true; client.release(destroy) } }
      try {
        const result = await client.query('select pg_try_advisory_lock($1, $2) as acquired', [5_042_002, 1])
        if (result.rows[0]?.acquired !== true) {
          releaseClient()
          return { acquired: false, release: async () => {} }
        }
        return { acquired: true, release: async () => {
          if (released) return
          try { await client.query('select pg_advisory_unlock($1, $2)', [5_042_002, 1]); releaseClient() }
          catch (error) { releaseClient(true); throw error }
        } }
      } catch (error) { releaseClient(true); throw error }
    },
    runPass: () => dependencies.runPass({ env: () => snapshot }),
    schedule: (callback, delay) => setTimeout(callback, delay), cancel: clearTimeout, log,
  }, intervalMs)
  let started = false
  let stopping: Promise<void> | undefined
  return {
    enabled: true,
    start() {
      if (started || stopping) return
      started = true
      log({ component: 'hashpaystream-upfront-settlement', event: 'worker_started', intervalMs })
      daemon.start()
    },
    trigger() { if (!stopping) daemon.trigger() },
    stop() {
      stopping ??= daemon.stop().finally(() => pool.end())
      return stopping
    },
  }
}
