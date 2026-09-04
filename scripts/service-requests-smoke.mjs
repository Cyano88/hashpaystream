import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServiceRequestsHandler } from '../api/service-requests.ts'

const secret = 'r'.repeat(48)
const customer = { userId: 'did:privy:customer', email: 'customer@example.com' }
const provider = { userId: 'did:privy:provider', email: 'provider@example.com' }
const attacker = { userId: 'did:privy:attacker', email: 'attacker@example.com' }
const key = email => createHmac('sha256', secret).update(`hashpaystream.account\0${email}`).digest('hex')
let identity = customer
let requestStore
let ownershipStore
let upstreamBody
let registeredRecipient
let eventStore
const handler = createServiceRequestsHandler({
  hasStore: () => true,
  env: () => ({ HASHPAYSTREAM_APP_OWNERSHIP_SECRET: secret, HASHPAYSTREAM_DIRECT_RECIPIENT_REGISTRY_SECRET: 'd'.repeat(48), HASHPAYSTREAM_ARC_API_KEY: `hpl_test_${'a'.repeat(40)}` }),
  identity: async () => identity,
  readRequests: async () => requestStore,
  readEvents: async () => eventStore,
  readAssessments: async () => undefined,
  readPartners: async () => undefined,
  mutateRequests: async (_key, update) => (requestStore = await update(requestStore)),
  readAccounts: async () => ({ schema: 1, accounts: { [key(provider.email)]: { accountKey: key(provider.email), email: provider.email, displayName: 'Provider', pocketId: '1234567890', walletAddress: '0x1111111111111111111111111111111111111111' } } }),
  mutateOwnership: async (_key, update) => (ownershipStore = await update(ownershipStore)),
  registerRecipient: async (_base, _apiKey, _secret, recipient, accountReference) => { registeredRecipient = { recipient, accountReference }; return { status: 201, body: { ok: true } } },
  upstream: async (_base, _apiKey, body) => { upstreamBody = body; return { status: 201, body: { ok: true, agreement: { id: 'agr_1234567890abcdef' }, payerReviewPath: '/agreements/agr_1234567890abcdef#access=private' } } },
  now: () => new Date('2026-08-26T12:00:00.000Z'), id: () => 'req_1234567890abcdef',
})
function response() { return { statusCode: 200, body: undefined, headers: {}, setHeader(name, value) { this.headers[name] = value; return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } } }
async function call(method, body, headers = {}) { const res = response(); await handler({ method, body, headers, query: {} }, res); return res }

const created = await call('POST', { action: 'create', providerEmail: provider.email, title: 'Landing page', description: 'Design and deliver the final responsive landing page.', amount: '100', durationSeconds: 3600, cancellationWindowSeconds: 900 }, { 'idempotency-key': 'create-request-1' })
assert.equal(created.statusCode, 201)
assert.equal(created.body.request.role, 'customer')
assert.equal(created.body.request.status, 'sent')

identity = attacker
assert.equal((await call('POST', { action: 'provider_accept', requestId: created.body.request.id, version: 1 })).statusCode, 404)

identity = provider
const accepted = await call('POST', { action: 'provider_accept', requestId: created.body.request.id, version: 1 })
assert.equal(accepted.body.request.role, 'provider')
assert.equal(accepted.body.request.status, 'provider_accepted')

identity = customer
const funded = await call('POST', { action: 'customer_accept', requestId: created.body.request.id, version: 1 })
assert.equal(funded.body.request.status, 'awaiting_funding')
assert.equal(funded.body.request.payerReviewPath.includes('private'), true)
assert.equal(upstreamBody.payerEmail, customer.email)
assert.equal(upstreamBody.durationSeconds, 3600)
assert.equal(upstreamBody.cancellationWindowSeconds, 900)
assert.equal(upstreamBody.recipient, '0x1111111111111111111111111111111111111111')
assert.deepEqual(registeredRecipient, { recipient: upstreamBody.recipient, accountReference: key(provider.email) })
assert.equal(ownershipStore.agreements.agr_1234567890abcdef.ownerAccountKey, key(provider.email))
assert.notEqual(ownershipStore.agreements.agr_1234567890abcdef.ownerHash, createHmac('sha256', secret).update(`hashpaystream.owner\0${customer.userId}`).digest('hex'))
eventStore = { schema: 1, events: { evt_activated: { event: 'agreement.activated', agreementId: 'agr_1234567890abcdef', createdAt: '2026-08-26T12:01:00.000Z' } } }
const afterFunding = await call('GET')
assert.equal(afterFunding.body.requests[0].status, 'funded')
assert.equal(afterFunding.body.requests[0].events.at(-1).type, 'request.funded')
eventStore.events.evt_completed = { event: 'agreement.completed', agreementId: 'agr_1234567890abcdef', createdAt: '2026-08-26T12:02:00.000Z' }
const afterCompletion = await call('GET')
assert.equal(afterCompletion.body.requests[0].status, 'completed')

console.log('HashPayStream customer-led request roles, version acceptance, provider ownership, and payer checkout checks passed.')
