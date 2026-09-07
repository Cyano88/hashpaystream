import pg from 'pg'
import { renderDurableStoreConnectionConfig } from './durable-store.js'

// Resolves every Trade table and verifies SELECT access without reading any rows.
const probeSql = `select 1 from public.hashpaystream_trade_listings,
  public.hashpaystream_trade_threads, public.hashpaystream_trade_messages,
  public.hashpaystream_trade_blocks, public.hashpaystream_trade_reports where false`

type ProbePool = Pick<pg.Pool, 'query' | 'on'>

export function createTradeReadinessProbe(
  createPool: (config: pg.PoolConfig) => ProbePool = config => new pg.Pool(config),
) {
  let pool: ProbePool | undefined
  let inFlight: Promise<void> | undefined
  return async function checkTrade(env: NodeJS.ProcessEnv) {
    if (env.HASHPAYSTREAM_TRADE_ENABLED !== 'true') return
    const url = (env.HASHPAYSTREAM_TRADE_DATABASE_URL ?? '').trim()
    if (!url || (env.HASHPAYSTREAM_TRADE_OWNERSHIP_SECRET ?? '').length < 32
      || !(env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID) || !env.PRIVY_APP_SECRET) {
      throw new Error('Trade configuration is unavailable.')
    }
    if (!pool) {
      pool = createPool({
        ...renderDurableStoreConnectionConfig(url, env),
        max: 1,
        connectionTimeoutMillis: 2000,
        statement_timeout: 1000,
        query_timeout: 1500,
        idleTimeoutMillis: 10000,
        allowExitOnIdle: true,
        options: '-c default_transaction_read_only=on',
      })
      // Idle connection loss must not crash the shared service. The next probe
      // reconnects and reports failure through the existing readiness handler.
      pool.on('error', () => {})
    }
    inFlight ??= pool.query(probeSql).then(() => undefined).finally(() => { inFlight = undefined })
    await inFlight
  }
}

export const checkTradeReadiness = createTradeReadinessProbe()
