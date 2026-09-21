import assert from 'node:assert/strict'
import fs from 'node:fs'
import {readStockPythReference,readStockPythMetadata,parseStockPythPrices,pythStockSession} from '../api/stock-pyth-market-data.ts'
const metadata=JSON.parse(fs.readFileSync('docs/evidence/stock-pyth-candidate.json','utf8')).feeds
const now=Date.parse('2026-09-14T15:00:10Z')/1000,open=Date.parse('2026-09-14T13:30:00Z')/1000,previousClose=Date.parse('2026-09-11T20:00:00Z')/1000
const latest={parsed:{timestampUs:String(now*1e6),priceFeeds:[{priceFeedId:1398,exponent:-5,price:'76522000',confidence:'1000',publisherCount:3,marketSession:'regular',feedUpdateTimestamp:now*1e6},{priceFeedId:7,exponent:-8,price:'100000000',confidence:'1000',publisherCount:3,marketSession:'regular',feedUpdateTimestamp:now*1e6}]}}
const candle=(start,count)=>({s:'ok',t:Array.from({length:count},(_,i)=>start+60*i),o:Array(count).fill(765.22),h:Array(count).fill(766),l:Array(count).fill(764),c:Array(count).fill(765.22)})
const day=candle(open,90),prior=candle(previousClose-60,1)
let fixture={metadata:structuredClone(metadata),latest:structuredClone(latest),day,prior},calls=[]
const fetcher=async(url,options)=>{
 calls.push([url,options]);let body
 if(url.includes('/symbols?'))body=[fixture.metadata[url.includes('query=SPY')?0:1]]
 else if(url.includes('latest_price')){const request=JSON.parse(options.body);assert.deepEqual(request.priceFeedIds,[1398,7]);assert.ok(request.properties.includes('feedUpdateTimestamp'));body=fixture.latest}
 else body=url.includes('from='+open)?fixture.day:fixture.prior
 return new Response(JSON.stringify(body))
}
const result=await readStockPythReference('synthetic-key',()=>now,15,fetcher)
assert.equal(result.source,'pyth-pro');assert.equal(result.spyUsdE8,76522000000n);assert.equal(result.usdcUsdE8,100000000n);assert.equal(result.observedAt,now);assert.equal(result.expiresAt,now+15)
assert.ok(calls.every(([u])=>!u.includes('alpaca')&&!u.includes('kraken')))
assert.ok(calls.filter(([u])=>u.includes('/symbols')).every(([,o])=>!o.headers.authorization))
await assert.rejects(()=>readStockPythReference('',()=>now,15,fetcher),/not configured/)
for(const change of [
 f=>f.latest.parsed.priceFeeds[0].feedUpdateTimestamp=(now-100)*1e6,
 f=>f.latest.parsed.priceFeeds[0].feedUpdateTimestamp=(now+1)*1e6,
 f=>f.latest.parsed.priceFeeds[0].publisherCount=2,
 f=>f.latest.parsed.priceFeeds[0].confidence='1000000',
 f=>f.latest.parsed.priceFeeds[0].marketSession='postMarket',
 f=>f.latest.parsed.priceFeeds[0].price='0',
 f=>f.latest.parsed.priceFeeds[0].exponent=-8,
 f=>f.latest.parsed.priceFeeds[1].price='98000000',
 f=>f.latest.parsed.priceFeeds[1].priceFeedId=1398,
 f=>f.metadata[0].pyth_lazer_id=1,
 f=>f.metadata[0].market_sessions.regular.min_pub=1,
 f=>f.metadata[0].state='inactive',
 f=>f.metadata[0].corporate_actions=[{activation:{us_equity_ex_date:{ex_date:'2026-09-14'}}}],
 f=>f.day.t.splice(1,1),f=>f.day.t[1]=f.day.t[0],f=>f.prior.s='error'
]){fixture=structuredClone({metadata,latest,day,prior});change(fixture);await assert.rejects(()=>readStockPythReference('synthetic-key',()=>now,15,fetcher))}
const schedule=metadata[0].schedule
assert.equal(pythStockSession(schedule,'2026-09-12'),null)
assert.equal(pythStockSession(schedule,'2026-11-26'),null)
assert.equal(pythStockSession(schedule,'2026-11-27').close,Date.parse('2026-11-27T18:00:00Z')/1000)
assert.equal(pythStockSession(schedule,'2026-10-30').open,Date.parse('2026-10-30T13:30:00Z')/1000)
assert.equal(pythStockSession(schedule,'2026-11-02').open,Date.parse('2026-11-02T14:30:00Z')/1000)
assert.throws(()=>pythStockSession('UTC;O,O,O,O,O,O,O;','2026-09-14'))
fixture=structuredClone({metadata,latest,day,prior});await assert.rejects(()=>readStockPythReference('synthetic-key',()=>Date.parse('2026-09-12T15:00:00Z')/1000,15,fetcher),/closed/)
console.log('Pyth reference passed: exact feeds, exponents, three publishers, carried-forward source age, confidence, depeg, missing history, corporate actions, regular sessions, holidays, DST and no legacy-provider requests.')
