import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./upfront-settlement-worker-preflight.ts', import.meta.url), 'utf8')

for (const requirement of [
  'NODE_VERSION_INVALID',
  'DATABASE_NOT_CONFIGURED',
  'DURABLE_STORE_MISSING',
  'ASSESSMENT_STORE_MISSING',
  'SETTLEMENT_LEASE_HELD',
  'pg_try_advisory_lock',
  'pg_advisory_unlock',
  'xLayerChainId === 196',
  'arcChainId === 5_042_002',
  'getBytecode',
  'ESCROW_CODE_MISSING',
  'ROUTER_CODE_MISSING',
  "signer: 'matched'",
]) assert.ok(source.includes(requirement), 'Missing preflight guarantee: ' + requirement)

assert.doesNotMatch(source, /writeContract|sendTransaction|sendRawTransaction/)
assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:databaseUrl|repaymentKey|apiKey)/)

console.log('HashPayStream settlement worker read-only preflight checks passed.')
