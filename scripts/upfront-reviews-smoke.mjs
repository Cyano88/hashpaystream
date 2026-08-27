import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createUpfrontReviewsHandler } from '../api/upfront-reviews.ts'

const response = () => ({ statusCode: 200, body: undefined, setHeader() { return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
async function call(handler, { method = 'GET', token = 'provider', query = {}, body } = {}) {
  const res = response()
  await handler({ method, query, body, headers: { authorization: `Bearer ${token}` } }, res)
  return res
}
const secret = 'review-ownership-secret-with-more-than-32-characters'
const requestId = 'uai_review123456789'
const ownerReference = 'hps_provider_' + createHmac('sha256', secret).update('upfront\0provider-user').digest('hex').slice(0, 32)
const env = {
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: secret, HASHPAYSTREAM_UPFRONT_STORE_KEY: 'review-test', HASHPAYSTREAM_ADMIN_EMAILS: 'operator@example.com',
  HASHPAYSTREAM_POLYDESK_BASE_URL: 'https://polydesk.example', HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN: 'service-token-with-more-than-32-characters',
  HASHPAYSTREAM_POLYDESK_SIGNING_SECRET: 'signing-secret-with-more-than-32-characters', HASHPAYSTREAM_POLYDESK_SIGNING_KEY_ID: 'test-key',
  HASHPAYSTREAM_POLYDESK_EIP712_SIGNER: '0x2222222222222222222222222222222222222222',
  HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: '0x3333333333333333333333333333333333333333', HASHPAYSTREAM_UPFRONT_CHAIN_ID: '1952',
}
const request = { requestId, agreement: { title: 'Clear website delivery', deliveryDescription: 'Deliver the approved website home page.', termsHash: 'sha256:' + 'a'.repeat(64) }, advance: { requestedBps: 2000 } }
let store = { schema: 1, records: { record: {
  ownerReference, requestHash: 'hash', status: 'completed', createdAt: '2026-08-27T09:00:00.000Z', request,
  response: { intelligence: { evidenceGrade: 'limited', confidence: 61, deliveryClarityScore: 64, reasonCodes: ['POLICY_LOW_DELIVERY_CLARITY'], summary: 'Manual delivery review is required.' }, decision: { requestId, decision: 'ESCALATE', maximumAdvanceBps: 2000, reasonCodes: ['POLICY_LOW_DELIVERY_CLARITY'] } },
} } }
let underwriteCalls = 0
const handler = createUpfrontReviewsHandler({
  identity: async req => req.headers.authorization === 'Bearer admin' ? { userId: 'operator-user', emails: ['operator@example.com'] } : req.headers.authorization === 'Bearer foreign' ? { userId: 'foreign-user', emails: ['foreign@example.com'] } : { userId: 'provider-user', emails: ['provider@example.com'] },
  read: async () => store, mutate: async (_key, update) => { store = update(store); return store },
  underwrite: async input => {
    underwriteCalls += 1
    assert.equal(input.manualReview.decision, 'approve')
    assert.match(input.manualReview.reviewerReference, /^hps_operator_[a-f0-9]{32}$/)
    return { requestId, decision: 'APPROVE', maximumAdvanceBps: 2000, reasonCodes: ['OPERATOR_REVIEW_APPROVED'], onchainOffer: { message: { protectedAmount: '10000' } } }
  },
  env: () => env, now: () => new Date('2026-08-27T10:00:00.000Z'),
})
assert.equal((await call(handler, { token: 'foreign', query: { requestId } })).statusCode, 404)
assert.equal((await call(handler, { query: { review: '1' } })).statusCode, 403)
const submitted = await call(handler, { method: 'POST', body: { action: 'submit', requestId } })
assert.equal(submitted.statusCode, 201)
assert.equal(submitted.body.assessment.review.status, 'pending')
const queue = await call(handler, { token: 'admin', query: { review: '1' } })
assert.equal(queue.body.reviews.length, 1)
assert.equal(queue.body.reviews[0].ownerReference, undefined)
assert.equal(queue.body.reviews[0].agreementId, undefined)
const approved = await call(handler, { method: 'POST', token: 'admin', body: { action: 'approve', requestId } })
assert.equal(approved.body.assessment.decision, 'APPROVE')
assert.equal(approved.body.assessment.review.status, 'approved')
assert.equal(underwriteCalls, 1)
assert.equal((await call(handler, { query: { requestId } })).body.assessment.decision, 'APPROVE')
store.records.record.response.decision.decision = 'ESCALATE'
store.records.record.review = { status: 'pending', submittedAt: '2026-08-27T10:00:00.000Z' }
assert.equal((await call(handler, { method: 'POST', token: 'admin', body: { action: 'decline', requestId } })).body.assessment.review.status, 'declined')
assert.equal(underwriteCalls, 1)
console.log('HashPayStream early-pay review checks passed.')
