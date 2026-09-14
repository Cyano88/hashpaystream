import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('./stock-delivery-settlement-preflight.ts', import.meta.url), 'utf8')
for (const requirement of ['stockDeliverySettlementConfiguration','verifyStockSettlementTargets','HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED','HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED','HASHPAYSTREAM_STOCK_DELIVERY_SETTLEMENT_ENABLED','DURABLE_STORE_MISSING','pg_try_advisory_lock','pg_advisory_unlock','xLayer.getChainId() === 196','arc.getChainId() === 5_042_002','HASHPAYSTREAM_STOCK_ASSET_ADDRESS','HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER','HASHPAYSTREAM_STOCK_RISK_SIGNER','HASHPAYSTREAM_STOCK_PROTECTION_SIGNER','financialProductionReady: false']) assert.ok(source.includes(requirement), 'Missing stock preflight guarantee: ' + requirement)
assert.doesNotMatch(source, /writeContract|sendTransaction|sendRawTransaction/)
assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:databaseUrl|repaymentKey|apiKey)/)
assert.doesNotMatch(source, /reason\.(?:message|stack|cause)/)
console.log('Stock delivery read-only preflight checks passed.')