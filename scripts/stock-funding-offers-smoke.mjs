import assert from 'node:assert/strict'
import { stockOfferUnavailableReason as reason, stockFeeUnits, rankFundingOffers, verifiedStockCompletionCounts } from '../src/lib/stockFundingOffers.ts'
const asset = '0x1111111111111111111111111111111111111111'
const offer = { id:'o1', funderId:'f1', funderName:'Funder', asset, chainId:196, tokenUnits:'2000000', principalUsdcUnits:'100000000', feeBps:100, repayAt:2000, expiresAt:1060 }
const policy = { chainId:196, asset, assetSymbol:"TESTx", assetDecimals:6, maxFeeBps:300, maxVolatilityBps:400, minExecutableLiquidityUsdcUnits:'500000000', maxPriceAgeSeconds:60, maxQuoteDeviationBps:50 }
const evidence = { asset, observedAt:990, eligibleUntil:1040, volatilityBps:200, executableLiquidityUsdcUnits:'1000000000', referenceValueUsdcUnits:'100000000', tokenUnits:'2000000', tradingAvailable:true, transfersAvailable:true, issuerEligible:true }
const context = { now:1000, repayAt:2000, requestedPrincipalUsdcUnits:'100000000', unreservedEarningsUsdcUnits:'101000000', inventoryTokenUnits:'2000000', funderApproved:true, workerEligible:true, policy, evidence }
assert.equal(reason(offer,context),undefined)
assert.equal(stockFeeUnits(100000000n,100,300),1000000n)
assert.equal(stockFeeUnits(1n,1,300),0n)
assert.equal(stockFeeUnits(100000000n,0,300),0n)
for (const patch of [{policy:undefined},{evidence:undefined},{funderApproved:false},{workerEligible:false},{inventoryTokenUnits:'1999999'},{unreservedEarningsUsdcUnits:'100999999'},{repayAt:2001},{requestedPrincipalUsdcUnits:'99999999'}]) assert.ok(reason(offer,{...context,...patch}),JSON.stringify(patch))
for (const patch of [{feeBps:301},{feeBps:-1},{feeBps:NaN},{expiresAt:1000},{chainId:1},{asset:'0x'+'0'.repeat(40)},{tokenUnits:'0'},{principalUsdcUnits:'1e8'}]) assert.ok(reason({...offer,...patch},context),JSON.stringify(patch))
for (const patch of [{volatilityBps:401},{volatilityBps:NaN},{observedAt:1001},{observedAt:939},{eligibleUntil:1000},{tradingAvailable:false},{transfersAvailable:false},{issuerEligible:false},{tokenUnits:'1'},{referenceValueUsdcUnits:'80000000'},{executableLiquidityUsdcUnits:'499999999'}]) assert.ok(reason(offer,{...context,evidence:{...evidence,...patch}}),JSON.stringify(patch))
for (const patch of [{assetSymbol:""},{assetDecimals:19},{maxFeeBps:NaN},{maxVolatilityBps:-1},{maxPriceAgeSeconds:0},{minExecutableLiquidityUsdcUnits:'0'},{maxQuoteDeviationBps:10001}]) assert.ok(reason(offer,{...context,policy:{...policy,...patch}}),JSON.stringify(patch))
const ranked = rankFundingOffers([{id:'cheap',feeBps:0,verifiedCompletedFundingCount:1},{id:'experienced',feeBps:200,verifiedCompletedFundingCount:9},{id:'tie-cheaper',feeBps:100,verifiedCompletedFundingCount:9},{id:'unknown',feeBps:0}])
assert.deepEqual(ranked.map(x=>x.id),['tie-cheaper','experienced','cheap','unknown'])
const settled = { positionId:'one',funderId:'funder',employerAccountId:'employer',workerAccountId:'worker',deliveryConfirmed:true,repaymentConfirmed:true,independentParticipationReviewed:true }
const counts = verifiedStockCompletionCounts([settled,settled,{...settled,positionId:'two',repaymentConfirmed:false},{...settled,positionId:'three',workerAccountId:'funder'},{...settled,positionId:'four',independentParticipationReviewed:false}])
assert.equal(counts.get('funder'),1)
console.log('Stock offer policy passed: fees, risk gates, quote matching, capacity, ranking and confirmed completion evidence.')
