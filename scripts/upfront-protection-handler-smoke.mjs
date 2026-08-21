import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { agreementIntelligenceRequestHash, buildAgreementIntelligenceRequest } from '../api/agreement-intelligence-schema.ts'
import { createUpfrontProtectionHandler } from '../api/upfront-protection.ts'

const protectionKey = '0x' + '11'.repeat(32)
const repaymentKey = '0x' + '22'.repeat(32)
const ownershipSecret = 'standalone-ownership-secret-32-characters'
const ownerReference = 'hps_provider_' + createHmac('sha256', ownershipSecret).update('upfront\0user-a').digest('hex').slice(0, 32)
const request = buildAgreementIntelligenceRequest({ requestId: 'uai_1234567890abcdef', issuedAt: '2026-08-19T12:00:00.000Z', providerIdentity: 'user-a', providerReferenceSecret: ownershipSecret, draft: { template: 'fixed_unlock', title: 'Verified research delivery', description: 'Deliver a cited research brief for payer review.', amount: '100.25', durationSeconds: 86400, cancellationWindowSeconds: 900, providerPayoutAddress: '0x3333333333333333333333333333333333333333', requestedAdvanceBps: 3000 } })
const arcRouter = '0x5555555555555555555555555555555555555555'
const agreement = { id: 'agr_hashpaystream12345678', status: 'active', template: 'fixed_unlock', title: request.agreement.title, description: request.agreement.deliveryDescription, amount: '100.25', recipient: arcRouter, durationSeconds: request.agreement.durationSeconds, cancellationWindowSeconds: request.agreement.cancellationWindowSeconds, chain: { network: 'arc', chainId: 5042002, onchainAgreementId: '0x' + '66'.repeat(32), termsHash: '0x' + '77'.repeat(32), amountUsdcUnits: request.agreement.amountUsdcUnits, releasedUsdcUnits: '0', remainingUsdcUnits: request.agreement.amountUsdcUnits } }
const position = { positionId: '0x' + '12'.repeat(32), funder: '0x4444444444444444444444444444444444444444', repaymentRecipient: '0x8888888888888888888888888888888888888888', provider: request.advance.providerPayoutAddress, termsHash: '0x' + request.agreement.termsHash.slice(7), intelligenceCommitment: '0x' + agreementIntelligenceRequestHash(request).slice(7), protectedAmount: request.agreement.amountUsdcUnits, advanceAmount: request.advance.requestedUsdcUnits, protectionDeadline: 1787227200, status: 'Funded' }
const env = { HASHPAYSTREAM_UPFRONT_ENABLED: 'true', HASHPAYSTREAM_UPFRONT_STORE_KEY: 'test:upfront', HASHPAYSTREAM_UPFRONT_ARC_API_KEY: 'hpl_test_12345678901234567890123456789012', HASHPAYSTREAM_APP_OWNERSHIP_SECRET: ownershipSecret, HASHPAYSTREAM_HASH_PAYLINK_BASE_URL: 'https://hashpaylink.example', HASHPAYSTREAM_XLAYER_RPC_URL: 'https://xlayer.example', HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: '0x2222222222222222222222222222222222222222', HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS: arcRouter, HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY: protectionKey, HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER: privateKeyToAccount(protectionKey).address, HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY: repaymentKey, HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER: privateKeyToAccount(repaymentKey).address }
const response = () => ({ statusCode: 200, body: undefined, setHeader() { return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
const handler = createUpfrontProtectionHandler({ identity: async () => 'user-a', readStore: async () => ({ schema: 1, records: { one: { ownerReference, status: 'completed', request } } }), agreement: async () => agreement, position: async () => position, env: () => env, now: () => new Date('2026-08-19T12:05:00.000Z') })
const ok = response()
await handler({ method: 'POST', headers: {}, body: { action: 'release', requestId: request.requestId, agreementId: agreement.id, positionId: position.positionId } }, ok)
assert.equal(ok.statusCode, 200)
assert.equal(ok.body.attestation.primaryType, 'ProtectionAttestation')

const foreign = createUpfrontProtectionHandler({ identity: async () => 'user-b', readStore: async () => ({ schema: 1, records: { one: { ownerReference, status: 'completed', request } } }), agreement: async () => agreement, position: async () => position, env: () => env })
const denied = response()
await foreign({ method: 'POST', headers: {}, body: { action: 'release', requestId: request.requestId, agreementId: agreement.id, positionId: position.positionId } }, denied)
assert.equal(denied.statusCode, 404)

console.log('HashPayStream Upfront protection handler checks passed.')
