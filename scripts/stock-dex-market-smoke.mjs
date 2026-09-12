import assert from 'node:assert/strict'
import {buildStockDexMarket} from '../api/stock-dex-market.ts'
import {stockMarketEvidence,readStockMarket} from '../api/stock-early-pay-chain.ts'
const asset='0xE7E553Cd128F0011777323A0b44a7b96EA1CB540',now=1000
const scope={chainId:31337,asset,worker:'0x'+'11'.repeat(20),funder:'0x'+'22'.repeat(20),earningsId:'0x'+'33'.repeat(32),principalUsdcUnits:'100000000',policyVersion:'3',tokenAmount:'130000000000000000'}
const c={chainId:31337,asset,assetDecimals:18,marketAdapter:'xlayer-dex-v1',maxRiskAge:60,policy:{maxPriceAgeSeconds:15,maxVolatilityBps:300},riskUrl:'http://127.0.0.1:1'}
const clearance={...scope,checkedAt:now,expiresAt:now+30,workerEligible:true,funderEligible:true,workerJurisdiction:'NG',funderJurisdiction:'SG',reviewReference:'synthetic'}
const review={participantClearance:clearance,assetReview:{chainId:31337,asset,policyVersion:'3',checkedAt:now,expiresAt:now+30,corporateActionsClear:true,transfersAvailable:true,reviewReference:'synthetic'}}
const reference={source:'alpaca-sip+kraken',observedAt:now,expiresAt:now+15,sessionOpen:900,sessionClose:1100,volatilityBps:30,fiveMinuteMoveBps:10,spyUsdE8:76500000000n,usdcUsdE8:100000000n}
for(const mutate of [
 (s,r,p)=>s.chainId=196,(s,r,p)=>s.principalUsdcUnits='100000001',(s,r,p)=>s.tokenAmount='0',
 (s,r,p)=>r.participantClearance.tokenAmount='1',(s,r,p)=>r.assetReview.corporateActionsClear=false,
 (s,r,p)=>r.assetReview.transfersAvailable=false,(s,r,p)=>r.assetReview.expiresAt=now,
 (s,r,p)=>r.assetReview.checkedAt=now+1,(s,r,p)=>r.assetReview.policyVersion='1',
 (s,r,p)=>p.observedAt=now-16,(s,r,p)=>p.sessionClose=now,(s,r,p)=>p.fiveMinuteMoveBps=51,
 (s,r,p)=>p.volatilityBps=301,(s,r,p)=>p.source='same-pool-twap'
]){const [s,r,p]=structuredClone([scope,review,reference]);mutate(s,r,p);await assert.rejects(()=>buildStockDexMarket(c,s,r,p,now))}
await assert.rejects(()=>readStockMarket(c,scope),/authentication/)
const market={chainId:31337,asset,observedAt:now,eligibleUntil:now+15,unitPriceUsdcUnits:'769000000',dex:{tokenAmount:scope.tokenAmount,expiresAt:now+15}}
assert.throws(()=>stockMarketEvidence(c,market,1n,now),/token amount/)
assert.throws(()=>stockMarketEvidence(c,{...market,dex:undefined},BigInt(scope.tokenAmount),now),/token amount/)
assert.ok(stockMarketEvidence(c,market,BigInt(scope.tokenAmount),now))
console.log('DEX adapter guards passed: exact token scope, authenticated review, amount cap, corporate-action/transfer review, timestamps, sessions and volatility limits.')
