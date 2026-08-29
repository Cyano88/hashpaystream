import assert from 'node:assert/strict'
import { recoverTypedDataAddress } from 'viem'
import { agreementIntelligenceRequestHash, buildAgreementIntelligenceRequest } from '../api/agreement-intelligence-schema.ts'
import { PROTECTION_TYPES, REPAYMENT_TYPES, signProtectionAttestation, signSplitSettlement } from '../api/upfront-protection-attestation.ts'

const privateKey = '0x' + '11'.repeat(32)
const request = buildAgreementIntelligenceRequest({
  requestId: 'uai_1234567890abcdef', issuedAt: '2026-08-19T12:00:00.000Z', providerIdentity: 'provider-a',
  providerReferenceSecret: 'standalone-ownership-secret-32-characters',
  providerArcAddress: '0x9999999999999999999999999999999999999999',
  draft: { template: 'fixed_unlock', title: 'Verified research delivery', description: 'Deliver a cited research brief for payer review.', amount: '100.25', durationSeconds: 86400, cancellationWindowSeconds: 900, providerPayoutAddress: '0x3333333333333333333333333333333333333333', requestedAdvanceBps: 3000 },
  trustedEvidence: { agreementState: 'funded', protectionDeadline: 1787227200, providerHistoryIncluded: false, sources: ['arc-funded-agreement'], dataGaps: ['provider-history'] },
})
const position = {
  positionId: '0x' + '12'.repeat(32), funder: '0x4444444444444444444444444444444444444444',
  repaymentRecipient: '0x8888888888888888888888888888888888888888',
  provider: request.advance.providerPayoutAddress, termsHash: '0x' + request.agreement.termsHash.slice(7),
  intelligenceCommitment: '0x' + agreementIntelligenceRequestHash(request).slice(7),
  protectedAmount: request.agreement.amountUsdcUnits, advanceAmount: request.advance.requestedUsdcUnits,
  protectionDeadline: 1787227200, status: 'Funded',
}
const arcRouter = '0x5555555555555555555555555555555555555555'
const agreement = {
  id: 'agr_hashpaystream12345678', status: 'active', template: 'fixed_unlock', title: request.agreement.title,
  description: request.agreement.deliveryDescription, amount: '100.25', recipient: arcRouter,
  durationSeconds: request.agreement.durationSeconds, cancellationWindowSeconds: request.agreement.cancellationWindowSeconds,
  chain: { network: 'arc', chainId: 5042002, onchainAgreementId: '0x' + '66'.repeat(32), termsHash: '0x' + '77'.repeat(32), amountUsdcUnits: request.agreement.amountUsdcUnits, releasedUsdcUnits: '0', remainingUsdcUnits: request.agreement.amountUsdcUnits, expiresAt: '1787227200' },
}
const protection = await signProtectionAttestation({ request, position, agreement, arcRouter, xLayerChainId: 1952, xLayerEscrow: '0x2222222222222222222222222222222222222222', privateKey, now: new Date('2026-08-19T12:05:00.000Z'), minimumRemainingSeconds: 21600 })
const recoveredProtection = await recoverTypedDataAddress({ ...protection, types: PROTECTION_TYPES, message: { ...protection.message, protectedAmount: BigInt(protection.message.protectedAmount), advanceAmount: BigInt(protection.message.advanceAmount) } })
assert.equal(recoveredProtection, protection.signer)
assert.equal(protection.message.repaymentRecipient, position.repaymentRecipient)

await assert.rejects(() => signProtectionAttestation({ request, position, agreement: { ...agreement, recipient: position.funder }, arcRouter, xLayerChainId: 1952, xLayerEscrow: '0x2222222222222222222222222222222222222222', privateKey, now: new Date('2026-08-19T12:05:00.000Z'), minimumRemainingSeconds: 21600 }), /repayment router/)

const nearDeadline = Math.floor(new Date('2026-08-19T12:05:00.000Z').getTime() / 1000) + 21_599
const nearRequest = { ...request, agreement: { ...request.agreement, protectionDeadline: nearDeadline } }
const nearPosition = { ...position, protectionDeadline: nearDeadline, intelligenceCommitment: '0x' + agreementIntelligenceRequestHash(nearRequest).slice(7) }
const nearAgreement = { ...agreement, chain: { ...agreement.chain, expiresAt: String(nearDeadline) } }
await assert.rejects(() => signProtectionAttestation({ request: nearRequest, position: nearPosition, agreement: nearAgreement, arcRouter, xLayerChainId: 1952, xLayerEscrow: '0x2222222222222222222222222222222222222222', privateKey, now: new Date('2026-08-19T12:05:00.000Z'), minimumRemainingSeconds: 21_600 }), /more time remaining/)

await assert.rejects(() => signProtectionAttestation({ request, position, agreement: { ...agreement, chain: { ...agreement.chain, expiresAt: '1787227201' } }, arcRouter, xLayerChainId: 1952, xLayerEscrow: '0x2222222222222222222222222222222222222222', privateKey, now: new Date('2026-08-19T12:05:00.000Z'), minimumRemainingSeconds: 21_600 }), /does not match the Arc agreement expiry/)

const completedAgreement = { ...agreement, status: 'completed', chain: { ...agreement.chain, releasedUsdcUnits: position.protectedAmount, remainingUsdcUnits: '0' } }
const repayment = await signSplitSettlement({ request, position: { ...position, status: 'Released' }, agreement: completedAgreement, arcRouter, privateKey, now: new Date('2026-08-20T12:05:00.000Z') })
const recoveredRepayment = await recoverTypedDataAddress({ ...repayment, types: REPAYMENT_TYPES, message: { ...repayment.message, funderAmount: BigInt(repayment.message.funderAmount), providerAmount: BigInt(repayment.message.providerAmount) } })
assert.equal(recoveredRepayment, repayment.signer)
assert.equal(repayment.message.funder, position.repaymentRecipient)
assert.equal(repayment.message.provider, request.settlement.providerRecipient)
assert.equal(repayment.message.funderAmount, position.advanceAmount)
assert.equal(BigInt(repayment.message.funderAmount) + BigInt(repayment.message.providerAmount), BigInt(position.protectedAmount))
await assert.rejects(() => signSplitSettlement({ request, position: { ...position, status: 'Released' }, agreement: { ...completedAgreement, chain: { ...completedAgreement.chain, releasedUsdcUnits: '1' } }, arcRouter, privateKey, now: new Date('2026-08-20T12:05:00.000Z') }), /not complete/)

console.log('HashPayStream Upfront protection and repayment attestation checks passed.')
