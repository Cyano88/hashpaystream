import assert from 'node:assert/strict'
import { createFundingPartnersHandler } from '../api/funding-partners.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function call(handler, { method = 'GET', token = 'member', body, query = {} } = {}) {
  const response = responseRecorder()
  await handler({ method, headers: { authorization: `Bearer ${token}` }, body, query }, response)
  return response
}

let store
const env = {
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: 's'.repeat(48),
  HASHPAYSTREAM_FUNDING_PARTNER_STORE_KEY: 'funding-partners-test',
  HASHPAYSTREAM_ADMIN_EMAILS: 'operator@example.com',
}
const handler = createFundingPartnersHandler({
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => { store = update(store); return store },
  identityEmails: async req => req.headers.authorization === 'Bearer admin' ? ['operator@example.com'] : ['member@example.com'],
  env: () => env,
  now: () => new Date('2026-08-25T09:00:00.000Z'),
  id: () => 'fpa_11111111-1111-4111-8111-111111111111',
})

const initial = await call(handler)
assert.equal(initial.statusCode, 200)
assert.equal(initial.body.profile.status, 'not_applied')
assert.equal(initial.body.profile.email, 'member@example.com')

const incomplete = await call(handler, { method: 'POST', body: { action: 'apply', name: 'M' } })
assert.equal(incomplete.statusCode, 400)

const applied = await call(handler, { method: 'POST', body: {
  action: 'apply', name: 'Member One', country: 'Nigeria', applicantType: 'individual', experience: 'some', expectedFundingRange: '1k_10k',
} })
assert.equal(applied.statusCode, 201)
assert.equal(applied.body.profile.status, 'pending')
assert.equal(Object.keys(store.applications).length, 1)

const reviewQueue = await call(handler, { token: 'admin', query: { review: '1' } })
assert.equal(reviewQueue.statusCode, 200)
assert.equal(reviewQueue.body.applications.length, 1)
assert.equal(reviewQueue.body.applications[0].accountKey, undefined)

const duplicate = await call(handler, { method: 'POST', body: {
  action: 'apply', name: 'Member One', country: 'Nigeria', applicantType: 'individual', experience: 'some', expectedFundingRange: '1k_10k',
} })
assert.equal(duplicate.statusCode, 409)

const unauthorizedReview = await call(handler, { method: 'POST', body: { action: 'review', applicationId: applied.body.profile.application.id, status: 'approved' } })
assert.equal(unauthorizedReview.statusCode, 403)

const approved = await call(handler, { method: 'POST', token: 'admin', body: { action: 'review', applicationId: applied.body.profile.application.id, status: 'approved' } })
assert.equal(approved.statusCode, 200)
assert.equal(approved.body.application.status, 'approved')

const profile = await call(handler)
assert.equal(profile.body.profile.status, 'approved')
assert.equal(profile.body.profile.application.accountKey, undefined)

const approvedReapply = await call(handler, { method: 'POST', body: {
  action: 'apply', name: 'Member One', country: 'Nigeria', applicantType: 'individual', experience: 'some', expectedFundingRange: '1k_10k',
} })
assert.equal(approvedReapply.statusCode, 409)

console.log('HashPayStream funding partner account checks passed.')
