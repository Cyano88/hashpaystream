import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createHashPayStreamUpfrontAssessmentHandler } from '../api/upfront-assessment.ts'
import { agreementIntelligenceRequestHash } from '../api/agreement-intelligence-schema.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function call(handler, body, idempotencyKey = 'upfront:user-a:0001') {
  const response = responseRecorder()
  await handler({ method: 'POST', body, headers: { authorization: 'Bearer user-a', 'idempotency-key': idempotencyKey } }, response)
  return response
}

const env = {
  HASHPAYSTREAM_UPFRONT_ENABLED: 'true',
  HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: 'true',
  HASHPAYSTREAM_ZEROSCOUT_BASE_URL: 'https://zeroscout.example',
  HASHPAYSTREAM_ZEROSCOUT_API_KEY: 'zs_live_test_key_123456789',
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: 'standalone-ownership-secret-32-characters',
  HASHPAYSTREAM_UPFRONT_STORE_KEY: 'test:hashpaystream:upfront',
  HASHPAYSTREAM_POLYDESK_BASE_URL: 'https://polydesk.example',
  HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN: 'polydesk-service-token-with-32-characters',
  HASHPAYSTREAM_POLYDESK_SIGNING_SECRET: 'polydesk-signing-secret-with-32-characters',
  HASHPAYSTREAM_POLYDESK_SIGNING_KEY_ID: 'polydesk-test-v1',
  HASHPAYSTREAM_POLYDESK_EIP712_SIGNER: '0x2222222222222222222222222222222222222222',
  HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: '0x3333333333333333333333333333333333333333',
  HASHPAYSTREAM_UPFRONT_CHAIN_ID: '1952',
  HASHPAYSTREAM_UPFRONT_ARC_API_KEY: 'hpl_test_1234567890abcdefghijklmnop',
  HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS: '0x4444444444444444444444444444444444444444',
}
const draft = {
  template: 'fixed_unlock',
  title: 'Verified research delivery',
  description: 'Deliver a cited research brief for payer review.',
  amount: '100.25',
  durationSeconds: 86400,
  cancellationWindowSeconds: 900,
  providerPayoutAddress: '0x1111111111111111111111111111111111111111',
  requestedAdvanceBps: 5000,
}
const providerArcAddress = '0x9999999999999999999999999999999999999999'
let store
const assessmentCalls = []
const handler = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a',
  providerWallets: async () => [draft.providerPayoutAddress],
  providerArcWallet: async () => providerArcAddress,
  mutate: async (_key, update) => { store = update(store); return store },
  assess: async request => {
    assessmentCalls.push(request)
    return { status: 201, body: {
      id: 'zai_assessment1234',
      schema: 'zeroscout.agreement-intelligence.result',
      schemaVersion: '1.0.0',
      requestCommitment: agreementIntelligenceRequestHash(request),
      intelligenceProvider: 'zeroscout-deterministic-evidence-engine',
      recommendation: 'review',
      confidence: 68,
      evidenceGrade: 'limited',
      deliveryClarityScore: 82,
      recommendedMaxAdvanceBps: 4000,
      summary: 'Terms are clear; provider history is not yet available.',
      riskFlags: ['No provider history supplied.'],
      signals: ['Terms are internally consistent.'],
      dataGaps: ['Payer funding is not yet confirmed.'],
      reasonCodes: ['NO_PROVIDER_HISTORY'],
      disclaimer: 'Decision support only.',
      proof: { contentHash: '0x' + 'a'.repeat(64) },
      createdAt: '2026-08-19T12:00:00.000Z',
    } }
  },
  underwrite: async (request, intelligence) => ({
    schema: 'polydesk.upfront.underwriting.decision',
    schemaVersion: '1.0.0',
    policyVersion: 'upfront-policy-test',
    decisionId: 'pud_1234567890abcdef',
    requestId: request.requestId,
    issuedAt: '2026-08-19T12:01:00.000Z',
    expiresAt: '2026-08-19T12:16:00.000Z',
    termsHash: request.agreement.termsHash,
    intelligenceCommitment: intelligence.requestCommitment,
    proofContentHash: intelligence.proof.contentHash,
    decision: 'APPROVE',
    maximumAdvanceBps: 4000,
    reasonCodes: ['POLICY_THRESHOLDS_MET'],
    humanReviewRequired: false,
    disclaimer: 'Decision support only.',
    attestation: { algorithm: 'hmac-sha256', keyId: 'polydesk-test-v1', payloadHash: 'sha256:' + 'd'.repeat(64), signature: 'e'.repeat(64) },
  }),
  env: () => env,
  now: () => new Date('2026-08-19T12:00:00.000Z'),
  requestId: () => 'uai_1234567890abcdef',
})

const created = await call(handler, draft)
assert.equal(created.statusCode, 201)
assert.equal(created.body.assessment.intelligence.schema, 'zeroscout.agreement-intelligence.result')
assert.equal(created.body.assessment.decision.decision, 'APPROVE')
assert.equal(assessmentCalls.length, 1)
assert.equal(assessmentCalls[0].schema, 'zeroscout.agreement-intelligence.request')
assert.equal(assessmentCalls[0].agreement.amountUsdcUnits, '100250000')
assert.equal(assessmentCalls[0].advance.requestedUsdcUnits, '50125000')
assert.equal(assessmentCalls[0].settlement.assetBridgeRequired, false)
assert.equal(assessmentCalls[0].settlement.providerRecipient, providerArcAddress)
assert.match(assessmentCalls[0].agreement.termsHash, /^sha256:[a-f0-9]{64}$/)
assert.match(assessmentCalls[0].source.providerReference, /^hps_provider_[a-f0-9]{32}$/)

const replayed = await call(handler, draft)
assert.equal(replayed.statusCode, 200)
assert.equal(replayed.body.replayed, true)
assert.equal(assessmentCalls.length, 1)

const changedReplay = await call(handler, { ...draft, amount: '101.25' })
assert.equal(changedReplay.statusCode, 409)
assert.match(changedReplay.body.error, /different Upfront request/)
assert.equal(assessmentCalls.length, 1)

const invalid = await call(handler, { ...draft, template: 'milestone' }, 'upfront:user-a:0002')
assert.equal(invalid.statusCode, 400)
assert.equal(assessmentCalls.length, 1)

const fundedAgreementId = 'agr_hashpaystream12345678'
const serviceAgreementId = 'agr_hashpaystreamservice123'
const fundedOwnerHash = createHmac('sha256', env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET).update('hashpaystream.owner\0user-a').digest('hex')
const providerAccountKey = createHmac('sha256', env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET).update('hashpaystream.account\0provider@example.com').digest('hex')
const serviceOwnerHash = createHmac('sha256', env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET).update(`hashpaystream.service-request-owner\0${providerAccountKey}`).digest('hex')
let fundedStore
let fundedAssessmentRequest
const fundedHandler = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a',
  providerWallets: async () => [draft.providerPayoutAddress],
  providerArcWallet: async () => providerArcAddress,
  providerAccountKeys: async () => [providerAccountKey],
  mutate: async (_key, update) => { fundedStore = update(fundedStore); return fundedStore },
  readOwnership: async () => ({ schema: 1, agreements: {
    [fundedAgreementId]: { agreementId: fundedAgreementId, ownerHash: fundedOwnerHash },
    [serviceAgreementId]: { agreementId: serviceAgreementId, ownerHash: serviceOwnerHash, ownerAccountKey: providerAccountKey },
  } }),
  agreement: async id => ({
    id, status: 'active', template: 'fixed_unlock', title: 'Authoritative funded delivery',
    description: 'Deliver the authoritative funded agreement package to the payer.',
    recipient: env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, durationSeconds: 86400, cancellationWindowSeconds: 900,
    chain: { network: 'arc', chainId: 5042002, amountUsdcUnits: '100250000', expiresAt: '1787227200' },
  }),
  assess: async request => {
    fundedAssessmentRequest = request
    return { status: 201, body: {
      id: 'zai_funded123456', schema: 'zeroscout.agreement-intelligence.result', schemaVersion: '1.0.0',
      requestCommitment: agreementIntelligenceRequestHash(request), intelligenceProvider: 'zeroscout-deterministic-evidence-engine',
      recommendation: 'proceed', confidence: 61, evidenceGrade: 'limited', deliveryClarityScore: 82,
      recommendedMaxAdvanceBps: 3500, summary: 'The funded agreement can proceed.', riskFlags: [], signals: [],
      dataGaps: ['provider-history', 'delivery-history'], reasonCodes: ['LIMITED_EVIDENCE', 'NO_PROVIDER_HISTORY'],
      disclaimer: 'Decision support only.', proof: { contentHash: '0x' + 'b'.repeat(64) }, createdAt: '2026-08-19T12:00:00.000Z',
    } }
  },
  underwrite: async (request, intelligence) => ({
    schema: 'polydesk.upfront.underwriting.decision', schemaVersion: '1.0.0', policyVersion: 'upfront-policy-test',
    decisionId: 'pud_funded123456', requestId: request.requestId, issuedAt: '2026-08-19T12:01:00.000Z', expiresAt: '2026-08-19T12:16:00.000Z',
    termsHash: request.agreement.termsHash, intelligenceCommitment: intelligence.requestCommitment, proofContentHash: intelligence.proof.contentHash,
    decision: 'APPROVE', maximumAdvanceBps: 3000, reasonCodes: ['POLICY_THRESHOLDS_MET'], humanReviewRequired: false,
    disclaimer: 'Decision support only.', attestation: { algorithm: 'hmac-sha256', keyId: 'polydesk-test-v1', payloadHash: 'sha256:' + 'c'.repeat(64), signature: 'd'.repeat(64) },
  }),
  env: () => env,
  now: () => new Date('2026-08-19T12:00:00.000Z'),
  requestId: () => 'uai_funded123456789',
})
const funded = await call(fundedHandler, { agreementId: fundedAgreementId, providerPayoutAddress: draft.providerPayoutAddress, requestedAdvanceBps: 3000 }, 'upfront:user-a:funded-0001')
assert.equal(funded.statusCode, 201)
assert.equal(funded.body.assessment.decision.decision, 'APPROVE')
assert.equal(fundedAssessmentRequest.agreement.state, 'funded')
assert.equal(fundedAssessmentRequest.agreement.protectionDeadline, 1787227200)
assert.equal(fundedAssessmentRequest.agreement.title, 'Authoritative funded delivery')
assert.deepEqual(fundedAssessmentRequest.evidence.sources, ['hashpaystream-authoritative-agreement', 'arc-funded-agreement'])
assert.deepEqual(fundedAssessmentRequest.evidence.dataGaps, ['provider-history', 'delivery-history'])
const serviceOwned = await call(fundedHandler, { agreementId: serviceAgreementId, providerPayoutAddress: draft.providerPayoutAddress, requestedAdvanceBps: 3000 }, 'upfront:user-a:service-funded-0001')
assert.equal(serviceOwned.statusCode, 201)

const notOwnedHandler = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a', providerWallets: async () => [draft.providerPayoutAddress], providerArcWallet: async () => providerArcAddress, mutate: async (_key, update) => { fundedStore = update(fundedStore); return fundedStore },
  readOwnership: async () => ({ schema: 1, agreements: {} }), agreement: async () => { throw new Error('must not fetch') }, env: () => env,
})
const notOwned = await call(notOwnedHandler, { agreementId: fundedAgreementId, providerPayoutAddress: draft.providerPayoutAddress, requestedAdvanceBps: 3000 }, 'upfront:user-a:funded-0002')
assert.equal(notOwned.statusCode, 404)

const foreignWallet = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a', providerWallets: async () => ['0x2222222222222222222222222222222222222222'],
  providerArcWallet: async () => providerArcAddress,
  mutate: async (_key, update) => { store = update(store); return store }, env: () => env,
})
const rejectedForeignWallet = await call(foreignWallet, draft, 'upfront:user-a:foreign-wallet')
assert.equal(rejectedForeignWallet.statusCode, 403)
assert.match(rejectedForeignWallet.body.error, /does not belong/)

const missingWallet = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a', providerWallets: async () => [],
  providerArcWallet: async () => providerArcAddress,
  mutate: async (_key, update) => { store = update(store); return store }, env: () => env,
})
const rejectedMissingWallet = await call(missingWallet, draft, 'upfront:user-a:missing-wallet')
assert.equal(rejectedMissingWallet.statusCode, 409)
assert.match(rejectedMissingWallet.body.error, /Create your X Layer payout wallet/)

const missingArcWallet = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a',
  providerWallets: async () => [draft.providerPayoutAddress],
  providerArcWallet: async () => { throw Object.assign(new Error('Connect your Circle Arc wallet before requesting early pay.'), { status: 409 }) },
  mutate: async (_key, update) => { store = update(store); return store },
  env: () => env,
})
const rejectedMissingArcWallet = await call(missingArcWallet, draft, 'upfront:user-a:missing-arc-wallet')
assert.equal(rejectedMissingArcWallet.statusCode, 409)
assert.match(rejectedMissingArcWallet.body.error, /Circle Arc wallet/)

const ambiguousWallet = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a',
  providerWallets: async () => [draft.providerPayoutAddress, '0x2222222222222222222222222222222222222222'],
  providerArcWallet: async () => providerArcAddress,
  mutate: async (_key, update) => { store = update(store); return store },
  env: () => env,
})
const rejectedAmbiguousWallet = await call(ambiguousWallet, draft, 'upfront:user-a:ambiguous-wallet')
assert.equal(rejectedAmbiguousWallet.statusCode, 409)
assert.match(rejectedAmbiguousWallet.body.error, /Multiple embedded payout wallets/)

const disabled = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a',
  providerWallets: async () => [draft.providerPayoutAddress],
  providerArcWallet: async () => providerArcAddress,
  mutate: async (_key, update) => { store = update(store); return store },
  assess: async () => { throw new Error('must not run') },
  underwrite: async () => { throw new Error('must not run') },
  env: () => ({ ...env, HASHPAYSTREAM_UPFRONT_ENABLED: 'false' }),
})
const hidden = await call(disabled, draft, 'upfront:user-a:0003')
assert.equal(hidden.statusCode, 404)

const v3Disabled = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'user-a',
  providerWallets: async () => [draft.providerPayoutAddress],
  providerArcWallet: async () => providerArcAddress,
  mutate: async (_key, update) => { store = update(store); return store },
  assess: async () => { throw new Error('must not run') },
  underwrite: async () => { throw new Error('must not run') },
  env: () => ({ ...env, HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: 'false' }),
})
assert.equal((await call(v3Disabled, draft, 'upfront:user-a:0004')).statusCode, 503)

console.log('HashPayStream Upfront assessment smoke checks passed.')
