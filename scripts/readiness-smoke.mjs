import assert from 'node:assert/strict'
import { privateKeyToAccount } from 'viem/accounts'
import { createHashPayStreamReadinessHandler } from '../api/readiness.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function call(handler, method = 'GET') {
  const response = responseRecorder()
  await handler({ method }, response)
  return response
}

const reads = []
const events = []
const ready = createHashPayStreamReadinessHandler({
  hasStore: () => true,
  read: async key => { reads.push(key); return undefined },
  env: () => ({
    HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY: 'test:hashpaystream:owners',
    HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER: 'readiness-registry-pepper-longer-than-thirty-two-characters',
    HASHPAYSTREAM_AGENT_CREDENTIAL_STORE_KEY: 'test:hashpaystream:credentials',
  }),
  logError: event => events.push(event),
})
const accepted = await call(ready)
assert.equal(accepted.statusCode, 200)
assert.deepEqual(accepted.body, { ok: true, service: 'hashpaystream', status: 'ready' })
assert.deepEqual(reads, ['test:hashpaystream:owners', 'test:hashpaystream:credentials'])
assert.equal(accepted.headers['cache-control'], 'no-store')
assert.equal(events.length, 0)

let drainingRead = false
const draining = createHashPayStreamReadinessHandler({
  isDraining: () => true,
  hasStore: () => { throw new Error('Dependency checks must not run while draining.') },
  read: async () => { drainingRead = true },
  logError: () => { throw new Error('Expected draining must not be logged as a dependency failure.') },
})
const drainingResponse = await call(draining)
assert.equal(drainingResponse.statusCode, 503)
assert.deepEqual(drainingResponse.body, { ok: false, service: 'hashpaystream', status: 'unavailable' })
assert.equal(drainingRead, false)

const disabledPilot = createHashPayStreamReadinessHandler({
  hasStore: () => true,
  read: async key => { assert.equal(key, 'hashpaystream:agreement-owners:v1'); return undefined },
  env: () => ({}),
})
assert.equal((await call(disabledPilot)).statusCode, 200)

const incompleteUpfront = createHashPayStreamReadinessHandler({
  hasStore: () => true,
  read: async () => undefined,
  env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'true' }),
  logError: event => {
    assert.equal(event.missingEnvironment.includes('HASHPAYSTREAM_ZEROSCOUT_API_KEY'), true)
    assert.equal(event.missingEnvironment.includes('HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY'), true)
  },
})
assert.equal((await call(incompleteUpfront)).statusCode, 503)

const protectionKey = `0x${'1'.repeat(64)}`
const repaymentKey = `0x${'2'.repeat(64)}`
const completeUpfrontEnvironment = {
  HASHPAYSTREAM_UPFRONT_ENABLED: 'true',
  VITE_HASHPAYSTREAM_UPFRONT_ENABLED: 'true',
  HASHPAYSTREAM_DIRECT_ARC_ENABLED: 'false',
  VITE_HASHPAYSTREAM_DIRECT_ARC_ENABLED: 'false',
  PRIVY_APP_ID: 'privy-test-app',
  PRIVY_APP_SECRET: 'privy-test-secret-long-enough',
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: 'ownership-secret-longer-than-thirty-two-characters',
  HASHPAYSTREAM_UPFRONT_STORE_KEY: 'test:hashpaystream:upfront',
  HASHPAYSTREAM_UPFRONT_ARC_API_KEY: 'hpl_test_12345678901234567890123456789012',
  HASHPAYSTREAM_UPFRONT_ARC_PROJECT_ID: 'project-upfront-test',
  HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_SECRET: 'webhook-secret-longer-than-thirty-two-characters',
  HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY: 'test:hashpaystream:upfront-webhooks',
  HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS: '0x1111111111111111111111111111111111111111',
  VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS: '0x1111111111111111111111111111111111111111',
  HASHPAYSTREAM_HASH_PAYLINK_BASE_URL: 'https://app.hashpaylink.com',
  HASHPAYSTREAM_ZEROSCOUT_BASE_URL: 'https://zeroscout.example',
  HASHPAYSTREAM_ZEROSCOUT_API_KEY: 'zeroscout-test-key-long-enough',
  HASHPAYSTREAM_POLYDESK_BASE_URL: 'https://polydesk.example',
  HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN: 'polydesk-service-token-longer-than-thirty-two-characters',
  HASHPAYSTREAM_POLYDESK_SIGNING_SECRET: 'polydesk-signing-secret-longer-than-thirty-two-characters',
  HASHPAYSTREAM_POLYDESK_EIP712_SIGNER: '0x2222222222222222222222222222222222222222',
  HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: '0x3333333333333333333333333333333333333333',
  VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: '0x3333333333333333333333333333333333333333',
  VITE_HASHPAYSTREAM_UPFRONT_REPAYMENT_RECIPIENT: '0x4444444444444444444444444444444444444444',
  HASHPAYSTREAM_UPFRONT_CHAIN_ID: '196',
  VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID: '196',
  HASHPAYSTREAM_XLAYER_RPC_URL: 'https://rpc.xlayer.tech',
  HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY: protectionKey,
  HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER: privateKeyToAccount(protectionKey).address,
  HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY: repaymentKey,
  HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER: privateKeyToAccount(repaymentKey).address,
  HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS: 'funder@example.com',
  VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED: 'true',
}
const completeUpfront = createHashPayStreamReadinessHandler({
  hasStore: () => true,
  read: async () => undefined,
  env: () => completeUpfrontEnvironment,
})
assert.equal((await call(completeUpfront)).statusCode, 200)

for (const requiredName of [
  'HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_SECRET',
  'HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY',
  'HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY',
  'HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS',
  'VITE_HASHPAYSTREAM_UPFRONT_REPAYMENT_RECIPIENT',
]) {
  const environment = { ...completeUpfrontEnvironment, [requiredName]: '' }
  const missingDependency = createHashPayStreamReadinessHandler({ hasStore: () => true, read: async () => undefined, env: () => environment })
  assert.equal((await call(missingDependency)).statusCode, 503, `${requiredName} must be required for readiness`)
}

const signerMismatch = createHashPayStreamReadinessHandler({
  hasStore: () => true,
  read: async () => undefined,
  env: () => ({ ...completeUpfrontEnvironment, HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER: completeUpfrontEnvironment.HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER }),
})
assert.equal((await call(signerMismatch)).statusCode, 503)

const unavailableEvents = []
const unavailable = createHashPayStreamReadinessHandler({
  hasStore: () => false,
  env: () => ({ SECRET_VALUE: 'must-not-be-logged' }),
  logError: event => unavailableEvents.push(event),
})
const rejected = await call(unavailable)
assert.equal(rejected.statusCode, 503)
assert.deepEqual(rejected.body, { ok: false, service: 'hashpaystream', status: 'unavailable' })
assert.deepEqual(unavailableEvents, [{
  component: 'hashpaystream-readiness',
  event: 'dependency_unavailable',
  status: 503,
}])
assert.equal(JSON.stringify(unavailableEvents).includes('must-not-be-logged'), false)

const invalidMethod = await call(ready, 'POST')
assert.equal(invalidMethod.statusCode, 405)
assert.equal(invalidMethod.headers.allow, 'GET')

console.log('HashPayStream readiness smoke checks passed.')
