import assert from 'node:assert/strict'
import {evaluateTwelveData} from './stock-twelve-data-evaluation.mjs'
const now=Date.parse('2026-09-14T15:00:10Z')/1000,open=Date.parse('2026-09-14T13:30:00Z')/1000
let calls=0,change=()=>{}
const fetcher=async(url,options)=>{
 calls++;assert.ok(!url.includes('private-key'));assert.equal(options.headers.Authorization,'apikey private-key')
 const u=new URL(url),symbol=u.searchParams.get('symbol');let body
 if(u.pathname==='/quote')body={symbol,...(symbol==='SPY'?{currency:'USD',mic_code:'ARCX'}:{}),timestamp:Math.floor(now/60)*60,last_quote_at:now,close:symbol==='SPY'?'765.22':'1',previous_close:'765.22',is_market_open:true}
 else body={status:'ok',meta:{symbol:'SPY',currency:'USD',mic_code:'ARCX',interval:'1min'},values:Array.from({length:90},(_,i)=>({datetime:new Date((open+i*60)*1000).toISOString().slice(0,19).replace('T',' '),open:'765',high:'766',low:'764',close:'765.22'}))}
 change(body,u);return new Response(JSON.stringify(body))
}
const missing=await evaluateTwelveData({},fetcher,()=>now);assert.equal(calls,0);assert.equal(missing.checks.access.status,'NOT_CONFIGURED')
const env={HASHPAYSTREAM_TWELVE_DATA_KEY:'private-key'},good=await evaluateTwelveData(env,fetcher,()=>now)
assert.equal(good.requests,3);assert.equal(good.productionReady,false);assert.equal(good.providerSwitched,false);assert.equal(good.checks.spyQuote.status,'OBSERVED');assert.equal(good.checks.currentSessionMinutes.barCount,90);assert.ok(!JSON.stringify(good).includes('private-key'))
for(const mutate of [b=>{if(b.symbol==='SPY')b.last_quote_at=now-60},b=>{if(b.symbol==='SPY')b.mic_code='XNAS'},b=>{if(b.symbol==='USDC/USD')b.close='0.97'},b=>{if(b.values)b.values.pop()},b=>{if(b.values)b.values[1].datetime=b.values[0].datetime},b=>{if(b.values)b.values[0].high='1'}]){
 change=mutate;const r=await evaluateTwelveData(env,fetcher,()=>now);assert.ok(Object.values(r.checks).some(c=>c.status==='NOT_VERIFIED'))
}
change=b=>{if(b.symbol==='SPY')b.is_market_open=false};const closed=await evaluateTwelveData(env,fetcher,()=>now);assert.equal(closed.checks.spyQuote.status,'MARKET_CLOSED');assert.equal(closed.checks.spyQuote.accessVerified,true);assert.equal(closed.requests,2);assert.equal(closed.checks.currentSessionMinutes.status,'SKIPPED')
const rejected=await evaluateTwelveData(env,async()=>{throw Error('private-key upstream secret')},()=>now);assert.ok(!JSON.stringify(rejected).includes('private-key'));assert.equal(rejected.productionReady,false)
console.log('Twelve Data evaluation passed: no-key zero requests, bounded calls, identity, freshness, depeg, history gaps, safe errors and no production approval.')
