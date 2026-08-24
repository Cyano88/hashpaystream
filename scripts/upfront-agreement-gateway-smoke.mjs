import assert from 'node:assert/strict'
import { createHashPayStreamUpfrontAgreementGateway } from '../api/upfront-agreement-gateway.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function call(handler, method = 'GET', input = {}) {
  const response = responseRecorder()
  await handler({
    method,
    query: input.query ?? {},
    body: input.body,
    headers: {
      authorization: 'Bearer upfront-test-user',
      ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
    },
  }, response)
  return response
}

const upfrontKey = `hpl_test_${'u'.repeat(32)}`
const normalKey = `hpl_test_${'n'.repeat(32)}`
const env = {
  HASHPAYSTREAM_UPFRONT_ENABLED: 'false',
  HASHPAYSTREAM_UPFRONT_ARC_API_KEY: upfrontKey,
  HASHPAYSTREAM_ARC_API_KEY: normalKey,
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: 'isolated-upfront-owner-secret-32-characters',
  HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY: 'test:upfront:owners',
  HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY: 'test:upfront:webhooks',
  HASHPAYSTREAM_HASH_PAYLINK_BASE_URL: 'https://app.hashpaylink.com',
}
let store
let observedApiKey = ''
let observedPayerEmail = ''
let fetchCalls = 0
const agreementId = 'agr_upfrontisolated1234'
const originalFetch = globalThis.fetch
globalThis.fetch = async (_url, init = {}) => {
  fetchCalls += 1
  observedApiKey = String(init.headers?.['x-api-key'] ?? '')
  observedPayerEmail = String(JSON.parse(String(init.body ?? '{}')).payerEmail ?? '')
  return new Response(JSON.stringify({
    ok: true,
    agreement: { id: agreementId, checkoutMode: 'human', status: 'draft' },
    payerReviewPath: `/agreements/${agreementId}#access=agrp_private_capability`,
  }), { status: 201, headers: { 'content-type': 'application/json' } })
}

try {
  const handler = createHashPayStreamUpfrontAgreementGateway({
    hasStore: () => true,
    read: async () => store,
    readEvents: async () => undefined,
    mutate: async (_key, update) => { store = update(store); return store },
    identity: async () => 'upfront-test-user',
    env: () => env,
    now: () => new Date('2026-08-20T00:00:00.000Z'),
  })

  const disabled = await call(handler, 'POST', { idempotencyKey: 'upfront:disabled:0001', body: {} })
  assert.equal(disabled.statusCode, 404)
  assert.equal(fetchCalls, 0)

  env.HASHPAYSTREAM_UPFRONT_ENABLED = 'true'
  const created = await call(handler, 'POST', {
    idempotencyKey: 'upfront:isolated:0001',
    body: {
      template: 'fixed_unlock',
      title: 'Isolated Upfront agreement',
      description: 'Deliver the verified Upfront integration package.',
      amount: '0.01',
      payerEmail: 'customer@example.com',
      recipient: '0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE',
      durationSeconds: 86400,
      cancellationWindowSeconds: 900,
    },
  })
  assert.equal(created.statusCode, 201)
  assert.equal(observedApiKey, upfrontKey)
  assert.notEqual(observedApiKey, normalKey)
  assert.equal(observedPayerEmail, 'customer@example.com')
  assert.equal(store.agreements[agreementId].agreementId, agreementId)
  console.log('Isolated Upfront agreement gateway smoke checks passed')
} finally {
  globalThis.fetch = originalFetch
}
