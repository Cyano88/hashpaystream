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
  "configuration: 'CONFIGURATION_CHECK_FAILED'",
  "databaseConnection: 'DATABASE_CONNECTION_FAILED'",
  "durableStore: 'DURABLE_STORE_CHECK_FAILED'",
  "lease: 'SETTLEMENT_LEASE_CHECK_FAILED'",
  "xLayerRpc: 'XLAYER_RPC_CHECK_FAILED'",
  "xLayerContract: 'XLAYER_CONTRACT_CHECK_FAILED'",
  "arcRpc: 'ARC_RPC_CHECK_FAILED'",
  "arcContract: 'ARC_CONTRACT_CHECK_FAILED'",
  'reason instanceof PreflightCheckError',
  'stageFailureCodes[stage]',
  "ENOTFOUND: 'DATABASE_DNS_FAILED'",
  "EAI_AGAIN: 'DATABASE_DNS_FAILED'",
  "ETIMEDOUT: 'DATABASE_CONNECTION_TIMEOUT'",
  "ENETUNREACH: 'DATABASE_NETWORK_UNREACHABLE'",
  "ECONNREFUSED: 'DATABASE_CONNECTION_REFUSED'",
  "ECONNRESET: 'DATABASE_CONNECTION_RESET'",
  "SELF_SIGNED_CERT_IN_CHAIN: 'DATABASE_TLS_CERTIFICATE_INVALID'",
  "'28P01': 'DATABASE_AUTHENTICATION_FAILED'",
  "'3D000': 'DATABASE_NOT_FOUND'",
  "'53300': 'DATABASE_CAPACITY_EXCEEDED'",
  'databaseConnectionFailureCodes[errorCode] ?? stageFailureCodes.databaseConnection',
  "signer: 'matched'",
]) assert.ok(source.includes(requirement), 'Missing preflight guarantee: ' + requirement)

assert.doesNotMatch(source, /writeContract|sendTransaction|sendRawTransaction/)
assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:databaseUrl|repaymentKey|apiKey)/)
assert.doesNotMatch(source, /reason\.(?:message|stack|cause)/)
assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:reason|errorCode|host|hostname)/)

console.log('HashPayStream settlement worker read-only preflight checks passed.')
