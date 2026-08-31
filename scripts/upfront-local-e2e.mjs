import assert from 'node:assert/strict'
import { createHashPayStreamUpfrontAssessmentHandler } from '../api/upfront-assessment.ts'
import { buildAgreementIntelligenceRequest } from '../api/agreement-intelligence-schema.ts'
import { requestPolyDeskUnderwriting } from '../api/polydesk-upfront-client.ts'

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`${name} is required for the local Upfront E2E check.`)
  return value
}

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

for (const name of [
  'HASHPAYSTREAM_ZEROSCOUT_BASE_URL', 'HASHPAYSTREAM_ZEROSCOUT_API_KEY',
  'HASHPAYSTREAM_APP_OWNERSHIP_SECRET', 'HASHPAYSTREAM_POLYDESK_BASE_URL',
  'HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN', 'HASHPAYSTREAM_POLYDESK_SIGNING_SECRET',
  'HASHPAYSTREAM_POLYDESK_SIGNING_KEY_ID', 'HASHPAYSTREAM_POLYDESK_EIP712_SIGNER',
  'HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS',
]) required(name)

const env = {
  ...process.env,
  HASHPAYSTREAM_UPFRONT_ENABLED: 'true',
  HASHPAYSTREAM_UPFRONT_CHAIN_ID: process.env.HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? '1952',
  HASHPAYSTREAM_UPFRONT_STORE_KEY: 'local-e2e:hashpaystream:upfront',
}

const expectedChainId = Number(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID)
assert.ok([1952, 196].includes(expectedChainId), 'Upfront E2E supports only X Layer testnet or mainnet.')
let store
const providerPayoutAddress = '0x1000000000000000000000000000000000000001'
const providerArcWalletAddress = '0x2000000000000000000000000000000000000002'
const request = {
  method: 'POST',
  headers: { authorization: 'Bearer local-e2e-session', 'idempotency-key': `upfront:local-e2e:${Date.now()}` },
  body: {
    template: 'fixed_unlock',
    title: 'Verified design system delivery',
    description: 'Deliver the documented design system, component inventory, acceptance checklist, and final review package to the payer.',
    amount: '100.25',
    durationSeconds: 86400,
    cancellationWindowSeconds: 900,
    providerPayoutAddress,
    requestedAdvanceBps: 3000,
  },
}
const handler = createHashPayStreamUpfrontAssessmentHandler({
  identity: async () => 'local-e2e-provider',
  providerWallets: async () => [providerPayoutAddress],
  providerArcWallet: async () => providerArcWalletAddress,
  mutate: async (_key, update) => { store = update(store); return store },
  env: () => env,
})
const response = responseRecorder()
await handler(request, response)

assert.equal(response.statusCode, 201, response.body?.error ?? 'Upfront assessment was not created.')
assert.equal(response.body?.ok, true)
assert.equal(response.body?.replayed, false)
assert.equal(response.body?.assessment?.intelligence?.schema, 'zeroscout.agreement-intelligence.result')
assert.equal(response.body?.assessment?.intelligence?.recommendation, 'proceed')
const draftStorageUri = String(response.body?.assessment?.intelligence?.proof?.storageUri ?? '')
assert.ok(draftStorageUri.startsWith('local-dev://intelligence/') || draftStorageUri.startsWith('https://') || draftStorageUri.startsWith('0g://'),
  'Agreement Intelligence must return a local or durable proof URI.')
assert.equal(response.body?.assessment?.decision?.schema, 'polydesk.upfront.underwriting.decision')
assert.equal(response.body?.assessment?.decision?.decision, 'ESCALATE')
assert.equal(response.body?.assessment?.decision?.humanReviewRequired, true)
assert.equal(response.body?.assessment?.decision?.onchainOffer, undefined)

const verifiedDraft = { ...request.body, requestedAdvanceBps: 3000 }
const verifiedRequest = buildAgreementIntelligenceRequest({
  requestId: `uai_${Date.now()}verified`,
  issuedAt: new Date().toISOString(),
  providerIdentity: 'local-e2e-provider',
  providerReferenceSecret: required('HASHPAYSTREAM_APP_OWNERSHIP_SECRET'),
  providerArcAddress: providerArcWalletAddress,
  draft: verifiedDraft,
  trustedEvidence: {
    agreementState: 'funded',
    protectionDeadline: Math.floor(Date.now() / 1_000) + 86_400,
    providerHistoryIncluded: false,
    sources: ['hashpaystream-authoritative-agreement', 'arc-funded-agreement'],
    dataGaps: ['provider-history', 'delivery-history'],
  },
})
const intelligenceResponse = await fetch(required('HASHPAYSTREAM_ZEROSCOUT_BASE_URL') + '/api/integrations/agreement-intelligence', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + required('HASHPAYSTREAM_ZEROSCOUT_API_KEY'), 'content-type': 'application/json' },
  body: JSON.stringify(verifiedRequest),
})
const verifiedIntelligence = await intelligenceResponse.json()
assert.equal(intelligenceResponse.status, 201, verifiedIntelligence?.error ?? 'Verified Agreement Intelligence request failed.')
assert.equal(verifiedIntelligence.recommendation, 'proceed')
assert.equal(verifiedIntelligence.evidenceGrade, 'limited')

const signedDecision = await requestPolyDeskUnderwriting({
  request: verifiedRequest,
  intelligence: verifiedIntelligence,
  baseUrl: required('HASHPAYSTREAM_POLYDESK_BASE_URL'),
  serviceToken: required('HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN'),
  signingSecret: required('HASHPAYSTREAM_POLYDESK_SIGNING_SECRET'),
  expectedKeyId: required('HASHPAYSTREAM_POLYDESK_SIGNING_KEY_ID'),
  expectedSigner: required('HASHPAYSTREAM_POLYDESK_EIP712_SIGNER'),
  escrowContract: required('HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS'),
  chainId: expectedChainId,
  now: new Date(),
})
assert.equal(signedDecision.decision, 'APPROVE')
assert.equal(signedDecision.onchainOffer?.domain?.chainId, expectedChainId)
assert.equal(signedDecision.onchainOffer?.domain?.verifyingContract?.toLowerCase(), required('HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS').toLowerCase())

console.log(JSON.stringify({
  ok: true,
  flow: 'HashPayStream -> ZeroScout -> PolyDesk Upfront',
  draftOnlyPath: {
    recommendation: response.body.assessment.intelligence.recommendation,
    evidenceGrade: response.body.assessment.intelligence.evidenceGrade,
    storageMode: response.body.assessment.intelligence.storageMode,
    decision: response.body.assessment.decision.decision,
    humanReviewRequired: response.body.assessment.decision.humanReviewRequired,
  },
  trustedEvidencePath: {
    recommendation: verifiedIntelligence.recommendation,
    evidenceGrade: verifiedIntelligence.evidenceGrade,
    decision: signedDecision.decision,
    maximumAdvanceBps: signedDecision.maximumAdvanceBps,
    signedOffer: Boolean(signedDecision.onchainOffer?.signature),
    chainId: signedDecision.onchainOffer?.domain?.chainId,
    escrowContract: signedDecision.onchainOffer?.domain?.verifyingContract,
  },
}, null, 2))
