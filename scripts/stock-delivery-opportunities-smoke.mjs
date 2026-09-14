import assert from 'node:assert/strict'
import { createStockDeliveryOpportunitiesHandler } from '../api/stock-delivery-opportunities.ts'
import { fundingPartnerAccountKey } from '../api/funding-partners.ts'

function response() { return { statusCode: 200, body: undefined, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this }, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this } } }
async function call(handler, method = 'GET', query = {}, body = {}) { const res = response(); await handler({ method, query, body, headers: { authorization: 'Bearer test' } }, res); return res }
const secret = 'stock-delivery-handler-secret-over-32-characters'
const worker = '0x1111111111111111111111111111111111111111', funder = '0x2222222222222222222222222222222222222222'
const env = { HASHPAYSTREAM_APP_OWNERSHIP_SECRET: secret, HASHPAYSTREAM_XLAYER_RPC_URL: 'https://rpc.xlayer.tech', HASHPAYSTREAM_STOCK_DELIVERY_CHAIN_ID: '196', HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS: '0x3333333333333333333333333333333333333333', HASHPAYSTREAM_STOCK_ASSET_ADDRESS: '0x4444444444444444444444444444444444444444', HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS: '0x5555555555555555555555555555555555555555', HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER: '0x6666666666666666666666666666666666666666', HASHPAYSTREAM_STOCK_RISK_SIGNER: '0x7777777777777777777777777777777777777777', HASHPAYSTREAM_STOCK_PROTECTION_SIGNER: '0x8888888888888888888888888888888888888888' }
const partners = { schema: 1, applications: { approved: { id: 'fpa_12345678-1234-1234-1234-123456789abc', accountKey: fundingPartnerAccountKey(secret, 'funder@example.com'), email: 'funder@example.com', name: 'Funder', country: 'NG', applicantType: 'individual', experience: 'some', expectedFundingRange: 'pilot', status: 'approved', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), walletAddress: funder } } }
const record = { id: '0x' + 'aa'.repeat(32), workerUserId: 'worker-user', partnerApplicationId: partners.applications.approved.id, status: 'requested', authorization: { terms: { funder } } }
const deliveries = { schema: 1, requests: { [record.id]: record } }
const base = { hasStore: () => true, env: () => env, readDeliveries: async () => deliveries, readPartners: async () => partners, readAssessments: async () => ({ schema: 1, records: {} }), mutateDeliveries: async () => deliveries, verifyReceipt: async () => { throw new Error('not called') }, now: () => new Date('2026-09-14T12:00:00Z') }
let handler = createStockDeliveryOpportunitiesHandler({ ...base, identity: async () => ({ userId: 'worker-user', emails: ['worker@example.com'], wallet: worker }) })
let result = await call(handler, 'GET', { view: 'worker' })
assert.equal(result.statusCode, 200); assert.equal(result.body.requests.length, 1); assert.equal(result.body.executionEnabled, false)
result = await call(handler, 'GET', { view: 'funder' }); assert.equal(result.statusCode, 403)
handler = createStockDeliveryOpportunitiesHandler({ ...base, identity: async () => ({ userId: 'funder-user', emails: ['funder@example.com'], wallet: funder }) })
result = await call(handler, 'GET', { view: 'funder' }); assert.equal(result.statusCode, 200); assert.equal(result.body.requests.length, 1)
result = await call(handler, 'POST', {}, { action: 'decline', deliveryId: record.id }); assert.equal(result.statusCode, 503)
assert.equal(result.body.error, 'Stock delivery is temporarily unavailable.')
console.log('Authenticated stock delivery opportunity scope and pause checks passed.')
