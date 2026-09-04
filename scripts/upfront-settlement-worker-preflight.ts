import pg from 'pg'
import { createPublicClient, http } from 'viem'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.js'
import { upfrontSettlementWorkerConfiguration } from '../api/upfront-settlement-worker.js'

const { Pool } = pg
const databaseUrl = String(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const workerEnabled = String(process.env.HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED ?? '').trim().toLowerCase() === 'true'

function code(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ''
  return /^[A-Z0-9_]{3,80}$/.test(message) ? message : 'SETTLEMENT_PREFLIGHT_FAILED'
}

function requireCheck(condition: unknown, errorCode: string): asserts condition {
  if (!condition) throw new Error(errorCode)
}

let pool: InstanceType<typeof Pool> | undefined
let client: Awaited<ReturnType<InstanceType<typeof Pool>['connect']>> | undefined
let leaseAcquired = false

try {
  requireCheck(Number(process.versions.node.split('.')[0]) === 22, 'NODE_VERSION_INVALID')
  requireCheck(workerEnabled, 'SETTLEMENT_WORKER_DISABLED')
  requireCheck(databaseUrl, 'DATABASE_NOT_CONFIGURED')
  const config = upfrontSettlementWorkerConfiguration(process.env)
  requireCheck(config.enabled, 'AUTO_SETTLEMENT_DISABLED')

  pool = new Pool({
    ...renderDurableStoreConnectionConfig(databaseUrl),
    application_name: 'hashpaystream-settlement-preflight',
    connectionTimeoutMillis: 10_000,
    max: 1,
  })
  client = await pool.connect()
  await client.query("set statement_timeout = '15s'")
  const durableStore = await client.query<{ relation: string | null }>(
    "select to_regclass('public.render_durable_kv')::text as relation",
  )
  requireCheck(durableStore.rows[0]?.relation === 'render_durable_kv', 'DURABLE_STORE_MISSING')
  const assessmentStore = await client.query<{ found: boolean }>(
    'select exists(select 1 from render_durable_kv where store_key = $1 and jsonb_typeof(value) = $2) as found',
    [config.storeKey, 'object'],
  )
  requireCheck(assessmentStore.rows[0]?.found === true, 'ASSESSMENT_STORE_MISSING')

  const lease = await client.query<{ acquired: boolean }>(
    'select pg_try_advisory_lock($1, $2) as acquired',
    [5_042_002, 1],
  )
  leaseAcquired = lease.rows[0]?.acquired === true
  requireCheck(leaseAcquired, 'SETTLEMENT_LEASE_HELD')

  const xLayer = createPublicClient({
    transport: http(config.xLayerRpcUrl, { timeout: 10_000, retryCount: 1 }),
  })
  const arc = createPublicClient({
    transport: http(config.arcRpcUrl, { timeout: 10_000, retryCount: 1 }),
  })
  const [xLayerChainId, arcChainId, escrowCode, routerCode] = await Promise.all([
    xLayer.getChainId(),
    arc.getChainId(),
    xLayer.getBytecode({ address: config.escrow }),
    arc.getBytecode({ address: config.router }),
  ])
  requireCheck(xLayerChainId === 196, 'XLAYER_CHAIN_INVALID')
  requireCheck(arcChainId === 5_042_002, 'ARC_CHAIN_INVALID')
  requireCheck(Boolean(escrowCode && escrowCode !== '0x'), 'ESCROW_CODE_MISSING')
  requireCheck(Boolean(routerCode && routerCode !== '0x'), 'ROUTER_CODE_MISSING')

  console.log(JSON.stringify({
    ok: true,
    service: 'hashpaystream-settlement-worker',
    nodeMajor: 22,
    database: 'ready',
    lease: 'available',
    xLayerChainId,
    arcChainId,
    contracts: { escrow: 'deployed', router: 'deployed' },
    signer: 'matched',
  }))
} catch (reason) {
  console.error(JSON.stringify({
    ok: false,
    service: 'hashpaystream-settlement-worker',
    error: code(reason),
  }))
  process.exitCode = 1
} finally {
  if (client && leaseAcquired) {
    await client.query('select pg_advisory_unlock($1, $2)', [5_042_002, 1]).catch(() => undefined)
  }
  client?.release()
  await pool?.end().catch(() => undefined)
}
