import assert from 'node:assert/strict'
import { createUpfrontOpportunitiesHandler } from '../api/upfront-opportunities.ts'
import { fundingPartnerAccountKey } from '../api/funding-partners.ts'

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
      onchainOffer: {
        domain: { name: 'HashPayStream Upfront', version: '1', chainId: 1952, verifyingContract: '0x2222222222222222222222222222222222222222' },
        primaryType: 'UnderwritingOffer',
        message: {
          provider: request.advance.providerPayoutAddress, termsHash: '0x' + '1'.repeat(64), intelligenceCommitment: '0x' + '2'.repeat(64),
          protectedAmount: request.agreement.amountUsdcUnits, maxAdvanceBps: 3000, protectionDeadline: 1787320000,
          underwritingDeadline: 1787310000, nonce: '0x' + '3'.repeat(64),
        },
        signature: '0x' + 'b'.repeat(130),
      },
    },
  },
}
const ownershipSecret = 'funding-partner-ownership-secret-longer-than-thirty-two-characters'
const base = {
  identityEmails: async () => ['funder@example.com', '0x3000000000000000000000000000000000000003'],
  readStore: async () => ({ schema: 1, records: { approved } }),
  readPartners: async () => ({ schema: 1, applications: { approved: { accountKey: fundingPartnerAccountKey(ownershipSecret, 'funder@example.com'), status: 'approved', walletAddress: '0x3000000000000000000000000000000000000003' } } }),
  position: async () => ({ funder: '0x0000000000000000000000000000000000000000', repaymentRecipient: '0x0000000000000000000000000000000000000000', status: 'available' }),
  env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'true', HASHPAYSTREAM_APP_OWNERSHIP_SECRET: ownershipSecret, HASHPAYSTREAM_XLAYER_RPC_URL: 'https://xlayer.example', HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: '0x2222222222222222222222222222222222222222', HASHPAYSTREAM_UPFRONT_CHAIN_ID: '1952' }),
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

const wrongWallet = await call(createUpfrontOpportunitiesHandler({ ...base, identityEmails: async () => ['funder@example.com', '0x4000000000000000000000000000000000000004'] }))
assert.equal(wrongWallet.statusCode, 409)
assert.match(wrongWallet.body.error, /Privy wallet/i)

const expired = await call(createUpfrontOpportunitiesHandler({ ...base, now: () => new Date('2026-08-21T12:16:00.000Z') }))
assert.equal(expired.statusCode, 200)
assert.equal(expired.body.opportunities.length, 0)

const fundedAfterExpiry = await call(createUpfrontOpportunitiesHandler({
  ...base,
  identityEmails: async () => ['funder@example.com', '0x3000000000000000000000000000000000000003'],
  now: () => new Date('2026-08-21T12:16:00.000Z'),
  position: async () => ({ funder: '0x3000000000000000000000000000000000000003', repaymentRecipient: '0x3000000000000000000000000000000000000003', status: 'funded' }),
}))
assert.equal(fundedAfterExpiry.statusCode, 200)
assert.equal(fundedAfterExpiry.body.opportunities[0].positionStatus, 'funded')
assert.equal(fundedAfterExpiry.body.opportunities[0].repaymentRecipient, '0x3000000000000000000000000000000000000003')

const disabled = await call(createUpfrontOpportunitiesHandler({ ...base, env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'false' }) }))
assert.equal(disabled.statusCode, 404)

console.log('HashPayStream private Upfront opportunity checks passed.')
