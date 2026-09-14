import pg from 'pg'
import { createPublicClient, getAddress, http, isAddress, parseAbi } from 'viem'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.js'
import { stockDeliverySettlementConfiguration } from '../api/stock-delivery-settlement-worker.js'
import { StockSettlementTargetError, verifyStockSettlementTargets } from '../api/stock-delivery-settlement-targets.js'
const { Pool } = pg
const stages = { configuration: 'CONFIGURATION_CHECK_FAILED', database: 'DATABASE_CONNECTION_FAILED', durableStore: 'DURABLE_STORE_CHECK_FAILED', lease: 'SETTLEMENT_LEASE_CHECK_FAILED', xLayer: 'XLAYER_TARGET_CHECK_FAILED', arc: 'ARC_TARGET_CHECK_FAILED' } as const
type Stage = keyof typeof stages
class PreflightError extends Error { constructor(readonly code: string) { super(code) } }
function requireCheck(value: unknown, code: string): asserts value { if (!value) throw new PreflightError(code) }
function address(name: string) { const value = String(process.env[name] ?? '').trim(); if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new PreflightError(name + '_INVALID'); return getAddress(value) }
function errorCode(reason: unknown, stage: Stage) { return reason instanceof StockSettlementTargetError ? reason.code : reason instanceof PreflightError ? reason.code : stages[stage] }
const databaseUrl = String(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
let pool: InstanceType<typeof Pool> | undefined, client: Awaited<ReturnType<InstanceType<typeof Pool>['connect']>> | undefined, leased = false, stage: Stage = 'configuration'
try {
  requireCheck(Number(process.versions.node.split('.')[0]) === 22, 'NODE_VERSION_INVALID')
  requireCheck(String(process.env.HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED ?? '').toLowerCase() === 'true', 'SETTLEMENT_WORKER_DISABLED')
  requireCheck(String(process.env.HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED ?? '').toLowerCase() === 'true', 'AUTO_SETTLEMENT_DISABLED')
  requireCheck(String(process.env.HASHPAYSTREAM_STOCK_DELIVERY_SETTLEMENT_ENABLED ?? '').toLowerCase() === 'true', 'STOCK_SETTLEMENT_DISABLED')
  requireCheck(databaseUrl, 'DATABASE_NOT_CONFIGURED')
  const config = stockDeliverySettlementConfiguration(process.env); requireCheck(config.enabled, 'STOCK_SETTLEMENT_DISABLED')
  const asset = address('HASHPAYSTREAM_STOCK_ASSET_ADDRESS'), underwritingSigner = address('HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER')
  const riskSigner = address('HASHPAYSTREAM_STOCK_RISK_SIGNER'), protectionSigner = address('HASHPAYSTREAM_STOCK_PROTECTION_SIGNER')
  const treasury = address('HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS')
  stage = 'database'; pool = new Pool({ ...renderDurableStoreConnectionConfig(databaseUrl), application_name: 'hashpaystream-stock-settlement-preflight', connectionTimeoutMillis: 10_000, max: 1 }); client = await pool.connect()
  stage = 'durableStore'; await client.query("set statement_timeout = '15s'"); const table = await client.query<{ relation: string | null }>("select to_regclass('public.render_durable_kv')::text as relation"); requireCheck(table.rows[0]?.relation === 'render_durable_kv', 'DURABLE_STORE_MISSING')
  stage = 'lease'; const lock = await client.query<{ acquired: boolean }>('select pg_try_advisory_lock($1, $2) as acquired', [5_042_002, 1]); leased = lock.rows[0]?.acquired === true; requireCheck(leased, 'SETTLEMENT_LEASE_HELD')
  stage = 'xLayer'; const xLayer = createPublicClient({ transport: http(config.xLayerRpcUrl, { timeout: 10_000, retryCount: 1 }) }); requireCheck(await xLayer.getChainId() === 196, 'XLAYER_CHAIN_INVALID'); const code = await xLayer.getCode({ address: config.deliveryContract })
  stage = 'arc'; const arc = createPublicClient({ transport: http(config.arcRpcUrl, { timeout: 10_000, retryCount: 1 }) }); requireCheck(await arc.getChainId() === 5_042_002, 'ARC_CHAIN_INVALID')
  const abi = parseAbi(['function eip712Domain() view returns (bytes1,string,string,uint256,address,bytes32,uint256[])','function paused() view returns (bool)','function arcRepaymentRouter() view returns (address)','function underwritingSigner() view returns (address)','function riskSigner() view returns (address)','function protectionSigner() view returns (address)','function allowedStockAssets(address) view returns (bool)','function creditSigner() view returns (address)','function platformTreasury() view returns (address)','function asset() view returns (address)'])
  await verifyStockSettlementTargets({ contract: config.deliveryContract, runtimeHash: config.runtimeHash, router: config.router, asset, underwritingSigner, riskSigner, protectionSigner, repaymentSigner: config.repaymentSigner, treasury, code,
    read: (target, name, args = []) => (target === 'delivery' ? xLayer : arc).readContract({ address: target === 'delivery' ? config.deliveryContract : config.router, abi, functionName: name as typeof abi[number]['name'], args: args as [] }), gasBalance: () => arc.getBalance({ address: config.repaymentSigner }) })
  console.log(JSON.stringify({ ok: true, service: 'hashpaystream-stock-delivery-settlement', database: 'ready', lease: 'available', xLayerChainId: 196, arcChainId: 5_042_002, runtime: 'matched', delivery: 'unpaused', asset: 'allowed', signers: 'matched-and-separate', router: 'matched', relayerGas: 'nonzero', financialProductionReady: false }))
} catch (reason) { console.error(JSON.stringify({ ok: false, service: 'hashpaystream-stock-delivery-settlement', error: errorCode(reason, stage) })); process.exitCode = 1 }
finally { if (client && leased) await client.query('select pg_advisory_unlock($1, $2)', [5_042_002, 1]).catch(() => undefined); client?.release(); await pool?.end().catch(() => undefined) }