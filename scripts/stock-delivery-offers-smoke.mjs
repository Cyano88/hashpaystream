import assert from 'node:assert/strict'
import { buildEligibleStockDeliveryOffers } from '../api/stock-delivery-offers.ts'
import { buildAgreementIntelligenceRequest } from '../api/agreement-intelligence-schema.ts'

const now = 1_789_380_000
const worker = '0x1111111111111111111111111111111111111111', workerArc = '0x1212121212121212121212121212121212121212'
const funderA = '0x2222222222222222222222222222222222222222', funderB = '0x2323232323232323232323232323232323232323'
const asset = '0x3333333333333333333333333333333333333333', contract = '0x4444444444444444444444444444444444444444'
const treasury = '0x5555555555555555555555555555555555555555', router = '0x9999999999999999999999999999999999999999'
const request = buildAgreementIntelligenceRequest({ requestId: 'uai_123456789abc', issuedAt: new Date(now * 1000).toISOString(), providerIdentity: 'worker-user', providerReferenceSecret: 's'.repeat(48), providerArcAddress: workerArc, draft: { template: 'fixed_unlock', title: 'Completed design work', description: 'Deliver the approved design package.', amount: '100', durationSeconds: 86_400, cancellationWindowSeconds: 0, providerPayoutAddress: worker, requestedAdvanceBps: 3_000 }, trustedEvidence: { agreementState: 'funded', protectionDeadline: now + 86_400, providerHistoryIncluded: false, sources: ['agreement'], dataGaps: ['history'] } })
const agreement = { id: 'agr_123456789abc', status: 'active', recipient: router, chain: { network: 'arc', chainId: 5_042_002, onchainAgreementId: '0x' + 'aa'.repeat(32), termsHash: '0x' + 'bb'.repeat(32), amountUsdcUnits: '100000000', remainingUsdcUnits: '100000000', expiresAt: String(now + 86_400) } }
const partner = (id, walletAddress, fee) => ({ id, accountKey: id, email: id + '@example.com', name: id, country: 'NG', applicantType: 'individual', experience: 'some', expectedFundingRange: 'pilot', status: 'approved', createdAt: new Date(now * 1000).toISOString(), updatedAt: new Date(now * 1000).toISOString(), walletAddress, stockOffersEnabled: true, stockFeeBps: fee })
const partners = { schema: 1, applications: {
  a: partner('fpa_11111111-1111-4111-8111-111111111111', funderA, 125),
  b: partner('fpa_22222222-2222-4222-8222-222222222222', funderB, 75),
  disabled: { ...partner('fpa_33333333-3333-4333-8333-333333333333', '0x2424242424242424242424242424242424242424', 10), stockOffersEnabled: false },
} }
const stock = { chainId: 196, asset, assetSymbol: 'wSPYx', assetDecimals: 18, marketAdapter: 'xlayer-dex-v1', marketDataProvider: 'twelve-data', rpcUrl: 'https://rpc.xlayer.tech/', policy: { chainId: 196, asset, assetSymbol: 'wSPYx', assetDecimals: 18, maxFeeBps: 300, maxVolatilityBps: 100, minExecutableLiquidityUsdcUnits: '50000000', maxPriceAgeSeconds: 300, maxQuoteDeviationBps: 100 } }
const keys = { underwritingKey: `0x${'01'.repeat(32)}`, riskKey: `0x${'02'.repeat(32)}`, protectionKey: `0x${'03'.repeat(32)}` }
const runtime = { chainId: 196, contract, asset, treasury, arcRepaymentRouter: router, runtimeHash: '0x' + '99'.repeat(32), rpcUrl: 'https://rpc.xlayer.tech/', underwritingSigner: '0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1', riskSigner: '0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c', protectionSigner: '0x3325a78425F17a7E487Eb5666b2bFd93aBb06c70' }
const market = async (_config, scope) => {
  const tokenAmount = BigInt(scope.principalUsdcUnits) * 10n ** 18n / 75_000_000n
  return { participantClearance: { ...scope, checkedAt: now - 10, expiresAt: now + 240, workerEligible: true, funderEligible: true, workerJurisdiction: 'NG', funderJurisdiction: 'SG', reviewReference: 'reviewed' }, chainId: 196, asset, observedAt: now - 10, eligibleUntil: now + 240, unitPriceUsdcUnits: '75000000', volatilityBps: 20, executableLiquidityUsdcUnits: '100000000', tradingAvailable: true, transfersAvailable: true, issuerEligible: true, dex: { tokenAmount: tokenAmount.toString(), amountOutUsdcUnits: '29980000', depthTokenAmount: tokenAmount.toString(), depthOutUsdcUnits: '100000000', blockNumber: '1', blockHash: '0x' + 'dd'.repeat(32), observedAt: now - 8, expiresAt: now + 240 } }
}
const offers = await buildEligibleStockDeliveryOffers({ record: { ownerReference: request.source.providerReference, requestHash: 'hash', agreementId: agreement.id, status: 'completed', createdAt: new Date(now * 1000).toISOString(), request, response: { decision: { decision: 'APPROVE' } } }, agreement, partners, worker, runtime, stock, arcRepaymentRouter: router, policyVersion: 'stock-delivery-v1', ...keys }, { market, capacity: async () => ({ ready: true, balance: 10n ** 20n }), now: () => now })
assert.deepEqual(offers.map(item => item.feeBps), [75, 125])
assert.equal(offers[0].authorization.terms.funder.toLowerCase(), funderB.toLowerCase())
assert.equal(offers[0].authorization.terms.advanceUsdcAmount, '30000000')
assert.equal(offers[0].authorization.protection.arcAgreementHash, agreement.chain.onchainAgreementId)
await assert.rejects(() => buildEligibleStockDeliveryOffers({ record: { ownerReference: request.source.providerReference, requestHash: 'hash', agreementId: agreement.id, status: 'completed', createdAt: new Date(now * 1000).toISOString(), request, response: { decision: { decision: 'APPROVE' } } }, agreement, partners, worker, runtime, stock: { ...stock, marketDataProvider: 'pyth-pro' }, arcRepaymentRouter: router, policyVersion: 'stock-delivery-v1', ...keys }, { market, capacity: async () => ({ ready: true, balance: 10n ** 20n }), now: () => now }), /market configuration/)
const noInventory = await buildEligibleStockDeliveryOffers({ record: { ownerReference: request.source.providerReference, requestHash: 'hash', agreementId: agreement.id, status: 'completed', createdAt: new Date(now * 1000).toISOString(), request, response: { decision: { decision: 'APPROVE' } } }, agreement, partners, worker, runtime, stock, arcRepaymentRouter: router, policyVersion: 'stock-delivery-v1', ...keys }, { market, capacity: async (_runtime, _stock, _funder, amount) => ({ ready: amount === undefined, balance: 0n }), now: () => now })
assert.equal(noInventory.length, 0)
console.log('Price-backed agreement stock offer generation checks passed.')