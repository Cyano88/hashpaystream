import assert from 'node:assert/strict'
import { buildAgreementIntelligenceRequest } from '../api/agreement-intelligence-schema.ts'
import { requestPolyDeskUnderwriting } from '../api/polydesk-upfront-client.ts'

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`${name} is required for the local Upfront E2E check.`)
  return value
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
const providerPayoutAddress = '0x1000000000000000000000000000000000000001'
const providerArcWalletAddress = '0x2000000000000000000000000000000000000002'
const fundedAgreement = {
  template: 'fixed_unlock',
  title: 'Verified design system delivery',
  description: 'Deliver the documented design system, component inventory, acceptance checklist, and final review package to the payer.',
  amount: '100.25',
  durationSeconds: 86400,
  cancellationWindowSeconds: 900,
  providerPayoutAddress,
  requestedAdvanceBps: 3000,
}
const verifiedRequest = buildAgreementIntelligenceRequest({
  requestId: `uai_${Date.now()}verified`,
  issuedAt: new Date().toISOString(),
  providerIdentity: 'local-e2e-provider',
  providerReferenceSecret: required('HASHPAYSTREAM_APP_OWNERSHIP_SECRET'),
  providerArcAddress: providerArcWalletAddress,
  draft: fundedAgreement,
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
  flow: 'Funded HashPayStream agreement -> ZeroScout -> PolyDesk Upfront',
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
