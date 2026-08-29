import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { createUpfrontOpportunitiesHandler } from '../api/upfront-opportunities.ts'
import { fundingPartnerAccountKey } from '../api/funding-partners.ts'
import { FUNDING_TERMS_TYPES } from '../api/upfront-funding-terms.ts'

function responseRecorder() {
  return { statusCode: 200, body: undefined, headers: {}, setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}
async function call(handler, { method = 'GET', query = {}, body = {} } = {}) {
  const response = responseRecorder()
  await handler({ method, query, body, headers: { authorization: 'Bearer test' } }, response)
  return response
}

const now = new Date('2026-08-21T12:00:00.000Z')
const secret = 'funding-partner-ownership-secret-longer-than-thirty-two-characters'
const providerId = 'did:privy:provider-a'
const providerOwner = 'hps_provider_' + createHmac('sha256', secret).update('upfront\0' + providerId).digest('hex').slice(0, 32)
const funderA = '0x3000000000000000000000000000000000000003'
const funderB = '0x4000000000000000000000000000000000000004'
const providerAccount = privateKeyToAccount('0x' + '12'.repeat(32))
const protectionKey = '0x' + '34'.repeat(32)
const request = {
  requestId: 'uai_funded123456789',
  agreement: { state: 'funded', title: 'Website delivery', amountUsdcUnits: '100000000', durationSeconds: 86400, protectionDeadline: 1787400000 },
  advance: { requestedUsdcUnits: '30000000', providerPayoutAddress: providerAccount.address },
  settlement: { providerRecipient: '0x1111111111111111111111111111111111111111' },
}
const approved = {
  ownerReference: providerOwner, requestHash: 'sha256:' + 'a'.repeat(64), agreementId: 'agr_hashpaystream12345678', status: 'completed', createdAt: now.toISOString(), request,
  response: { intelligence: { evidenceGrade: 'limited', confidence: 68 }, decision: { decision: 'APPROVE', maximumAdvanceBps: 3000, expiresAt: '2026-08-21T12:15:00.000Z', onchainOffer: { domain: { name: 'HashPayStream Upfront', version: '1', chainId: 1952, verifyingContract: '0x2222222222222222222222222222222222222222' }, primaryType: 'UnderwritingOffer', message: { provider: request.advance.providerPayoutAddress, termsHash: '0x' + '1'.repeat(64), intelligenceCommitment: '0x' + '2'.repeat(64), protectedAmount: request.agreement.amountUsdcUnits, maxAdvanceBps: 3000, protectionDeadline: 1787400000, underwritingDeadline: 1787314500, nonce: '0x' + '3'.repeat(64) }, signature: '0x' + 'b'.repeat(130) } } },
}
let store = { schema: 1, records: { approved } }
const partners = { schema: 1, applications: {
  partner_a: { id: 'partner_a', accountKey: fundingPartnerAccountKey(secret, 'a@example.com'), email: 'a@example.com', name: 'Northstar Capital', country: 'NG', applicantType: 'company', experience: 'some', expectedFundingRange: 'under-1k', status: 'approved', createdAt: now.toISOString(), updatedAt: now.toISOString(), walletAddress: funderA },
  partner_b: { id: 'partner_b', accountKey: fundingPartnerAccountKey(secret, 'b@example.com'), email: 'b@example.com', name: 'River Fund', country: 'NG', applicantType: 'company', experience: 'new', expectedFundingRange: 'under-1k', status: 'approved', createdAt: now.toISOString(), updatedAt: now.toISOString(), walletAddress: funderB },
} }
const identity = value => async () => value
const base = {
  readStore: async () => store,
  mutateStore: async (_key, update) => { store = await update(store); return store },
  readPartners: async () => partners,
  position: async () => ({ funder: '0x0000000000000000000000000000000000000000', repaymentRecipient: '0x0000000000000000000000000000000000000000', status: 'available' }),
  capacity: async wallet => ({ balance: wallet.toLowerCase() === funderA.toLowerCase() ? 20_000_000n : 40_000_000n, allowed: true }),
  env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'true', HASHPAYSTREAM_APP_OWNERSHIP_SECRET: secret, HASHPAYSTREAM_XLAYER_RPC_URL: 'https://xlayer.example', HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: '0x2222222222222222222222222222222222222222', HASHPAYSTREAM_UPFRONT_CHAIN_ID: '1952', HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY: protectionKey, HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER: privateKeyToAccount(protectionKey).address, HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS: '0x5000000000000000000000000000000000000005' }),
  now: () => now,
}
const providerIdentity = { userId: providerId, emails: ['provider@example.com'], wallets: [providerAccount.address] }
const partnerAIdentity = { userId: 'partner-a', emails: ['a@example.com'], wallets: [funderA] }
const partnerBIdentity = { userId: 'partner-b', emails: ['b@example.com'], wallets: [funderB] }

const beforeAssignment = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(partnerAIdentity) }))
assert.equal(beforeAssignment.statusCode, 200)
assert.equal(beforeAssignment.body.opportunities.length, 0, 'approved partners must not browse unassigned agreements')

const matches = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(providerIdentity) }), { query: { view: 'partners', requestId: request.requestId } })
assert.equal(matches.statusCode, 200)
assert.equal(matches.body.partners.length, 2)
assert.equal(matches.body.partners.find(item => item.id === 'partner_a').maximumRequestUsdcUnits, '20000000')
assert.equal(matches.body.partners.find(item => item.id === 'partner_b').maximumRequestUsdcUnits, '30000000')
assert.equal(matches.body.partners.find(item => item.id === 'partner_a').fundingTerms.message.funder, funderA)
assert.equal(Object.hasOwn(matches.body.partners[0], 'balance'), false, 'provider response must not expose exact balances')

const overCapacity = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(providerIdentity) }), { method: 'POST', body: { action: 'select_partner', requestId: request.requestId, partnerId: 'partner_a', advanceUsdcUnits: '25000000', providerSignature: '0x' + 'a'.repeat(130) } })
assert.equal(overCapacity.statusCode, 409)
assert.match(overCapacity.body.error, /cannot cover/i)

const selectedTerms = matches.body.partners.find(item => item.id === 'partner_a').fundingTerms
const providerSignature = await providerAccount.signTypedData({ domain: selectedTerms.domain, types: FUNDING_TERMS_TYPES, primaryType: 'FundingTerms', message: { ...selectedTerms.message, advanceAmount: BigInt(selectedTerms.message.advanceAmount), funderRepaymentAmount: BigInt(selectedTerms.message.funderRepaymentAmount), platformFeeAmount: BigInt(selectedTerms.message.platformFeeAmount) } })
const selected = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(providerIdentity) }), { method: 'POST', body: { action: 'select_partner', requestId: request.requestId, partnerId: 'partner_a', advanceUsdcUnits: '20000000', providerSignature } })
assert.equal(selected.statusCode, 201)
assert.equal(selected.body.selection.partnerName, 'Northstar Capital')
assert.equal(selected.body.selection.quote.fundingFeeBps, 100)

const assignedA = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(partnerAIdentity) }))
assert.equal(assignedA.body.opportunities.length, 1)
assert.equal(assignedA.body.opportunities[0].requestedAdvanceUsdcUnits, '20000000')
assert.equal(assignedA.body.opportunities[0].fundingTerms.message.funderRepaymentAmount, '20160000')
const hiddenFromB = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(partnerBIdentity) }))
assert.equal(hiddenFromB.body.opportunities.length, 0)

const providerSelection = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(providerIdentity) }), { query: { view: 'partners', requestId: request.requestId } })
assert.equal(providerSelection.body.partners.length, 0)
assert.equal(providerSelection.body.selection.status, 'pending')

const declined = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(partnerAIdentity) }), { method: 'POST', body: { action: 'decline', requestId: request.requestId } })
assert.equal(declined.statusCode, 200)
const reopened = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(providerIdentity) }), { query: { view: 'partners', requestId: request.requestId } })
assert.equal(reopened.body.partners.length, 2)
assert.equal(reopened.body.selection.status, 'declined')

const forbidden = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity({ userId: 'other', emails: ['other@example.com'], wallets: [] }) }), { query: { view: 'partners', requestId: request.requestId } })
assert.equal(forbidden.statusCode, 404)

const disabled = await call(createUpfrontOpportunitiesHandler({ ...base, identity: identity(providerIdentity), env: () => ({ HASHPAYSTREAM_UPFRONT_ENABLED: 'false' }) }))
assert.equal(disabled.statusCode, 404)

console.log('HashPayStream private capacity-aware funding request checks passed.')
