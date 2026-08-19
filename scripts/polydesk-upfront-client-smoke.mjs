import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { agreementIntelligenceRequestHash, buildAgreementIntelligenceRequest } from '../api/agreement-intelligence-schema.ts'
import { verifyPolyDeskDecision } from '../api/polydesk-upfront-client.ts'

const TYPES = {
  UnderwritingOffer: [
    { name: 'provider', type: 'address' }, { name: 'termsHash', type: 'bytes32' },
    { name: 'intelligenceCommitment', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' },
    { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
    { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
  ],
}
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}
const privateKey = '0x' + '11'.repeat(32)
const account = privateKeyToAccount(privateKey)
const escrowContract = '0x2222222222222222222222222222222222222222'
const signingSecret = 'polydesk-signing-secret-with-32-characters'
const request = buildAgreementIntelligenceRequest({
  requestId: 'uai_1234567890abcdef', issuedAt: '2026-08-19T12:00:00.000Z', providerIdentity: 'user-a',
  providerReferenceSecret: 'standalone-ownership-secret-32-characters',
  draft: {
    template: 'fixed_unlock', title: 'Verified research delivery', description: 'Deliver a cited research brief for payer review.',
    amount: '100.25', durationSeconds: 86400, cancellationWindowSeconds: 900,
    providerPayoutAddress: '0x3333333333333333333333333333333333333333', requestedAdvanceBps: 4000,
  },
})
const commitment = agreementIntelligenceRequestHash(request)
const offer = {
  domain: { name: 'HashPayStream Upfront', version: '1', chainId: 1952, verifyingContract: escrowContract },
  primaryType: 'UnderwritingOffer',
  message: {
    provider: request.advance.providerPayoutAddress, termsHash: '0x' + request.agreement.termsHash.slice(7),
    intelligenceCommitment: '0x' + commitment.slice(7), protectedAmount: request.agreement.amountUsdcUnits,
    maxAdvanceBps: 4000, protectionDeadline: 1787227200, underwritingDeadline: 1787141700,
    nonce: '0x' + '44'.repeat(32),
  },
  signer: account.address,
}
offer.signature = await account.signTypedData({
  domain: offer.domain, types: TYPES, primaryType: offer.primaryType,
  message: { ...offer.message, protectedAmount: BigInt(offer.message.protectedAmount) },
})
const decision = {
  schema: 'polydesk.upfront.underwriting.decision', schemaVersion: '1.0.0', policyVersion: 'upfront-policy-test',
  decisionId: 'pud_1234567890abcdef', requestId: request.requestId, issuedAt: '2026-08-19T12:00:00.000Z',
  expiresAt: '2026-08-19T12:15:00.000Z', termsHash: request.agreement.termsHash,
  intelligenceCommitment: commitment, proofContentHash: '0x' + '55'.repeat(32), decision: 'APPROVE',
  maximumAdvanceBps: 4000, reasonCodes: ['POLICY_THRESHOLDS_MET'], humanReviewRequired: false,
  disclaimer: 'Decision support only.', onchainOffer: offer,
}
const payloadHash = createHash('sha256').update(canonical(decision)).digest('hex')
const envelope = { ok: true, decision: { ...decision, attestation: {
  algorithm: 'hmac-sha256', keyId: 'polydesk-test-v1', payloadHash: 'sha256:' + payloadHash,
  signature: createHmac('sha256', signingSecret).update(payloadHash).digest('hex'),
} } }
const intelligence = {
  schema: 'zeroscout.agreement-intelligence.result', schemaVersion: '1.0.0', requestCommitment: commitment,
  recommendation: 'proceed', confidence: 80, evidenceGrade: 'standard', deliveryClarityScore: 90,
  recommendedMaxAdvanceBps: 4000, reasonCodes: [], proof: { contentHash: decision.proofContentHash },
}
const input = {
  request, intelligence, signingSecret, expectedKeyId: 'polydesk-test-v1', expectedSigner: account.address,
  escrowContract, chainId: 1952, now: new Date('2026-08-19T12:05:00.000Z'),
}

const verified = await verifyPolyDeskDecision(envelope, input)
assert.equal(verified.onchainOffer?.signer, account.address)
assert.equal(verified.onchainOffer?.message.provider, request.advance.providerPayoutAddress)

await assert.rejects(
  () => verifyPolyDeskDecision({ ...envelope, decision: { ...envelope.decision, onchainOffer: {
    ...offer, message: { ...offer.message, provider: '0x4444444444444444444444444444444444444444' },
  } } }, input),
  /invalid onchain underwriting offer/,
)

console.log('HashPayStream PolyDesk EIP-712 verification checks passed.')
