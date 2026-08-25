import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createCustomerRequestsHandler } from '../api/customer-requests.ts'

const agreementId = 'agr_1234567890abcdef'
const secret = 's'.repeat(48)
const payerEmail = 'customer@example.com'
const payerHash = createHmac('sha256', secret).update(`hashpaystream.payer\0${payerEmail}`).digest('hex')
let humanStore = {
  schema: 1,
  agreements: {
    [agreementId]: {
      agreementId,
      ownerHash: 'owner-hash',
      payerHash,
      payerReviewPath: `/agreements/${agreementId}#access=private-capability`,
      source: 'human',
      createdAt: '2026-08-25T08:00:00.000Z',
      updatedAt: '2026-08-25T08:00:00.000Z',
    },
  },
  idempotency: {},
}
let upfrontStore = { schema: 1, agreements: {}, idempotency: {} }
let revoked = 0
const fetcher = async (_url, init = {}) => {
  if (init.method === 'POST') {
    revoked += 1
    assert.deepEqual(JSON.parse(init.body), { action: 'rotate_payer_link', agreementId })
    return new Response(JSON.stringify({ ok: true, payerReviewPath: `/agreements/${agreementId}#access=revoked-capability` }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response(JSON.stringify({ ok: true, agreements: [{ id: agreementId, title: 'Landing page', description: 'Design and build a landing page.', amount: '100000', status: 'awaiting_start' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const handler = createCustomerRequestsHandler({
  env: () => ({ HASHPAYSTREAM_APP_OWNERSHIP_SECRET: secret, HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY: 'requests-human-test', HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY: 'requests-upfront-test', HASHPAYSTREAM_ARC_API_KEY: `hpl_test_${'a'.repeat(40)}`, HASHPAYSTREAM_UPFRONT_ARC_API_KEY: `hpl_test_${'b'.repeat(40)}` }),
  identity: async () => payerEmail,
  hasStore: () => true,
  read: async key => key === 'requests-human-test' ? humanStore : upfrontStore,
  mutate: async (key, update) => {
    if (key === 'requests-human-test') return (humanStore = await update(humanStore))
    return (upfrontStore = await update(upfrontStore))
  },
  fetcher,
  now: () => new Date('2026-08-25T09:00:00.000Z'),
})

function responseRecorder() {
  return { statusCode: 200, body: undefined, headers: {}, setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}
async function call(method = 'GET', body) {
  const response = responseRecorder()
  await handler({ method, headers: { authorization: 'Bearer payer' }, body }, response)
  return response
}

const inbox = await call()
assert.equal(inbox.statusCode, 200)
assert.equal(inbox.body.requests.length, 1)
assert.equal(inbox.body.requests[0].decision, 'to_review')
assert.equal(inbox.body.requests[0].payerReviewPath.includes('private-capability'), true)

const declined = await call('POST', { action: 'decline', agreementId })
assert.equal(declined.statusCode, 200)
assert.equal(declined.body.decision, 'declined')
assert.equal(revoked, 1)
assert.equal(humanStore.agreements[agreementId].declinedAt, '2026-08-25T09:00:00.000Z')

const replay = await call('POST', { action: 'decline', agreementId })
assert.equal(replay.statusCode, 200)
assert.equal(revoked, 1)

const history = await call()
assert.equal(history.body.requests[0].decision, 'declined')

console.log('HashPayStream payer-only request, capability revocation, and decline replay checks passed.')
