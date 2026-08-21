import assert from 'node:assert/strict'
import { createUpfrontOpportunitiesHandler } from '../api/upfront-opportunities.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function call(handler) {
  const response = responseRecorder()
  await handler({ method: 'GET', headers: { authorization: 'Bearer funder' } }, response)
  return response
}

const now = new Date('2026-08-21T12:00:00.000Z')
const request = {
  requestId: 'uai_funded123456789',
  agreement: { state: 'funded', title: 'Website delivery', amountUsdcUnits: '100000000', durationSeconds: 86400 },
  advance: { requestedUsdcUnits: '30000000', providerPayoutAddress: '0x1111111111111111111111111111111111111111' },
}
const approved = {
  ownerReference: 'hps_provider_test', requestHash: 'sha256:' + 'a'.repeat(64), agreementId: 'agr_hashpaystream12345678',
  status: 'completed', createdAt: now.toISOString(), request,
  response: {
    intelligence: { evidenceGrade: 'limited', confidence: 68 },
    decision: {
      decision: 'APPROVE', maximumAdvanceBps: 3000, expiresAt: '2026-08-21T12:15:00.000Z',
      onchainOffer: { domain: { chainId: 1952, verifyingContract: '0x2222222222222222222222222222222222222222' }, signature: '0x' + 'b'.repeat(130) },
    },
  },
}
const base = {
  identityEmails: async () => ['funder@example.com'],
  readStore: async () => ({ schema: 1, records: { approved } }),
  env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'true', HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS: 'funder@example.com' }),
  now: () => now,
}

const visible = await call(createUpfrontOpportunitiesHandler(base))
assert.equal(visible.statusCode, 200)
assert.equal(visible.body.opportunities.length, 1)
assert.equal(visible.body.opportunities[0].agreementId, approved.agreementId)
assert.equal(visible.body.opportunities[0].protectedUsdcUnits, '100000000')

const forbidden = await call(createUpfrontOpportunitiesHandler({ ...base, identityEmails: async () => ['other@example.com'] }))
assert.equal(forbidden.statusCode, 403)
assert.match(forbidden.body.error, /not approved/i)

const walletVisible = await call(createUpfrontOpportunitiesHandler({
  ...base,
  identityEmails: async () => ['0x85a530abbe102d1bf4fd084551944b0cdd94dbf4'],
  env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'true', HASHPAYSTREAM_UPFRONT_FUNDER_WALLETS: '0x85a530abbe102d1bf4fd084551944b0cdd94dbf4' }),
}))
assert.equal(walletVisible.statusCode, 200)
assert.equal(walletVisible.body.opportunities.length, 1)

const expired = await call(createUpfrontOpportunitiesHandler({ ...base, now: () => new Date('2026-08-21T12:16:00.000Z') }))
assert.equal(expired.statusCode, 200)
assert.equal(expired.body.opportunities.length, 0)

const disabled = await call(createUpfrontOpportunitiesHandler({ ...base, env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'false' }) }))
assert.equal(disabled.statusCode, 404)

console.log('HashPayStream private Upfront opportunity checks passed.')
