import fs from 'node:fs'
const metadata=JSON.parse(fs.readFileSync('docs/evidence/stock-pyth-candidate.json','utf8')).feeds
import assert from 'node:assert/strict'
import {stockProviderPreflight} from './stock-provider-preflight.mjs'
const now=Math.floor(Date.now()/1000),calls=[]
const fetcher=async(url,options)=>{
 calls.push(url)
 if(url.includes('/symbols?'))return new Response(JSON.stringify([metadata[url.includes('query=SPY')?0:1]]))
 if(url.includes('kraken'))return new Response(JSON.stringify({error:[],result:{'USDC/USD':[['1.0000','100',now]]}}))
 if(url.includes('backed'))return new Response(JSON.stringify({isTradingHalted:false,trading:{openNow:false,nextChangeAt:'2026-09-14T00:00:00Z'}}))
 return new Response('{}',{status:403})
}
const report=await stockProviderPreflight({},fetcher)
assert.equal(report.productionReady,false);assert.equal(report.checks.publicFeedMetadata.status,'VERIFIED');assert.equal(report.checks.independentStockData.status,'NOT_CONFIGURED')
assert.ok(report.blockers.some(b=>b.includes('closed')))
const secretReport=await stockProviderPreflight({HASHPAYSTREAM_PYTH_PRO_KEY:'never-print-key',HASHPAYSTREAM_ALPACA_KEY:'never-print-key',HASHPAYSTREAM_ALPACA_SECRET:'never-print-secret',HASHPAYSTREAM_STOCK_RISK_ADAPTER_TOKEN:'never-print-token',HASHPAYSTREAM_STOCK_CONFIG:JSON.stringify({riskUrl:'https://private.example/review'})},fetcher)
assert.equal(secretReport.checks.independentStockData.status,'FAILED')
assert.equal(secretReport.checks.participantAndAssetReview.decisionsVerified,false)
assert.ok(!JSON.stringify(secretReport).includes('never-print'))
assert.ok(!JSON.stringify(secretReport).includes('private.example'))
assert.ok(calls.every(url=>!url.includes('private.example')))
const failure=await stockProviderPreflight({},async()=>{throw new DOMException('do not expose upstream text','TimeoutError')})
assert.equal(failure.checks.publicFeedMetadata.reason,'TimeoutError')
assert.ok(!JSON.stringify(failure).includes('upstream text'))
console.log('Provider preflight passed: missing configuration, source status, closed-session blocker, secret redaction, safe errors and no fabricated live review request.')
