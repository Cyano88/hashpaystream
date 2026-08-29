import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServiceRequestsHandler } from '../api/service-requests.ts'

const secret = 'u'.repeat(48)
const customer = { userId: 'customer', email: 'customer@example.com' }
const provider = { userId: 'provider', email: 'provider@example.com' }
const accountKey = (email) =>
  createHmac('sha256', secret)
    .update(`hashpaystream.account\0${email}`)
    .digest('hex')
const router = '0x2222222222222222222222222222222222222222'
let identity = customer
let requests
let ownership
let upstreamInput
let payerUpstreamInput
let v3Enabled = true
let idSequence = 0
let upstreamResponse = {
  status: 409,
  body: { ok: false, error: 'Configured recipient mismatch.' },
}
const handler = createServiceRequestsHandler({
  hasStore: () => true,
  env: () => ({
    HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: String(v3Enabled),
    HASHPAYSTREAM_APP_OWNERSHIP_SECRET: secret,
    HASHPAYSTREAM_ARC_API_KEY: `hpl_test_${'a'.repeat(40)}`,
    HASHPAYSTREAM_UPFRONT_ARC_API_KEY: `hpl_test_${'b'.repeat(40)}`,
    HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS: router,
  }),
  identity: async () => identity,
  readRequests: async () => requests,
  readEvents: async () => undefined,
  mutateRequests: async (_key, update) => (requests = await update(requests)),
  readAccounts: async () => ({
    schema: 1,
    accounts: {
      [accountKey(provider.email)]: {
        accountKey: accountKey(provider.email),
        email: provider.email,
        displayName: 'Provider',
        pocketId: '1234567890',
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    },
  }),
  mutateOwnership: async (_key, update) =>
    (ownership = await update(ownership)),
  upstream: async (_base, apiKey, body) => {
    upstreamInput = { apiKey, body }
    return upstreamResponse
  },
  payerUpstream: async (_base, apiKey, capability, body) => {
    payerUpstreamInput = { apiKey, capability, body }
    return {
      status: 200,
      body: {
        ok: true,
        agreement: { id: body.agreementId },
        payer: { walletLinked: false },
      },
    }
  },
  now: () => new Date('2026-08-26T13:00:00.000Z'),
  id: () => `req_upfront12345678${++idSequence}`,
})
function response() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}
async function call(method, body, headers = {}) {
  const res = response()
  await handler({ method, body, headers, query: {} }, res)
  return res
}

const offer = await call(
  'POST',
  {
    action: 'create',
    providerEmail: provider.email,
    title: 'Product photos',
    description: 'Shoot and deliver ten edited product photographs.',
    amount: '50',
    durationSeconds: 259200,
    cancellationWindowSeconds: 900,
  },
  { 'idempotency-key': 'create-upfront-1' },
)
identity = provider
assert.equal(
  (
    await call('POST', {
      action: 'provider_counter',
      requestId: offer.body.request.id,
      version: 1,
      durationSeconds: 3600,
      upfrontRequested: true,
      upfrontReason: 'I need materials before starting the work.',
    })
  ).statusCode,
  400,
)
assert.equal(
  (
    await call('POST', {
      action: 'provider_counter',
      requestId: offer.body.request.id,
      version: 1,
      upfrontRequested: true,
      upfrontReason: 'short',
    })
  ).statusCode,
  400,
)
const countered = await call('POST', {
  action: 'provider_counter',
  requestId: offer.body.request.id,
  version: 1,
  amount: '55',
  upfrontRequested: true,
  upfrontReason: 'I need studio rental and materials before the shoot.',
})
assert.equal(countered.body.request.activeVersion, 2)
identity = customer
assert.equal(
  (
    await call('POST', {
      action: 'customer_accept',
      requestId: offer.body.request.id,
      version: 1,
    })
  ).statusCode,
  409,
)
const failedAcceptance = await call('POST', {
  action: 'customer_accept',
  requestId: offer.body.request.id,
  version: 2,
})
assert.equal(failedAcceptance.statusCode, 409)
assert.equal(
  requests.requests[offer.body.request.id].customerAcceptedVersion,
  undefined,
)
assert.equal(
  requests.requests[offer.body.request.id].events.some(
    (event) => event.type === 'request.customer_accept',
  ),
  false,
)
const payerCapability = `agrp_${'p'.repeat(43)}`
upstreamResponse = {
  status: 201,
  body: {
    ok: true,
    agreement: { id: 'agr_upfront123456789' },
    payerReviewPath: `/agreements/agr_upfront123456789#access=${payerCapability}`,
  },
}
const accepted = await call('POST', {
  action: 'customer_accept',
  requestId: offer.body.request.id,
  version: 2,
})
assert.equal(accepted.body.request.status, 'awaiting_funding')
assert.equal(
  accepted.body.request.events.filter(
    (event) => event.type === 'request.customer_accept',
  ).length,
  1,
)
assert.equal(upstreamInput.body.recipient, router)
assert.equal(upstreamInput.apiKey, `hpl_test_${'b'.repeat(40)}`)
assert.equal(ownership.agreements.agr_upfront123456789.source, 'upfront')

const payerReview = await call('POST', {
  action: 'payer_review',
  requestId: offer.body.request.id,
})
assert.equal(payerReview.statusCode, 200)
assert.equal(payerUpstreamInput.apiKey, `hpl_test_${'b'.repeat(40)}`)
assert.equal(payerUpstreamInput.capability, payerCapability)
assert.deepEqual(payerUpstreamInput.body, {
  agreementId: 'agr_upfront123456789',
  payerEmail: customer.email,
  action: 'review',
})

v3Enabled = false
assert.equal((await call('POST', {
  action: 'payer_review',
  requestId: offer.body.request.id,
})).statusCode, 200)

const directOffer = await call(
  'POST',
  {
    action: 'create',
    providerEmail: provider.email,
    title: 'Migration safety test',
    description: 'Verify that new early-pay terms stay paused.',
    amount: '10',
    durationSeconds: 86400,
    cancellationWindowSeconds: 900,
  },
  { 'idempotency-key': 'create-v3-disabled' },
)
identity = provider
assert.equal((await call('POST', {
  action: 'provider_counter',
  requestId: directOffer.body.request.id,
  version: 1,
  upfrontRequested: true,
  upfrontReason: 'Materials are required before work can begin.',
})).statusCode, 503)

const providerFundingAttempt = await call('POST', {
  action: 'payer_review',
  requestId: offer.body.request.id,
})
assert.equal(providerFundingAttempt.statusCode, 404)

console.log(
  'HashPayStream immutable early-pay negotiation, payer-bound funding proxy, stale-version rejection, and router isolation checks passed.',
)
