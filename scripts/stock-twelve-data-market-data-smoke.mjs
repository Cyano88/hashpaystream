import assert from 'node:assert/strict'
import {readStockTwelveDataReference,twelveStockSession} from '../api/stock-twelve-data-market-data.ts'
const now=Date.parse('2026-09-14T15:00:10Z')/1000,open=Date.parse('2026-09-14T13:30:00Z')/1000
const stamp=t=>new Date(t*1000).toISOString().slice(0,19).replace('T',' ')
let change=()=>{},calls=[]
const fetcher=async(url,options)=>{
 calls.push({url,options});assert.equal(options.headers.Authorization,'apikey private-key');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store')
 const u=new URL(url),symbol=u.searchParams.get('symbol');let body
 if(u.pathname.endsWith('/quote'))body=symbol==='SPY'?{symbol:'SPY',name:'State Street SPDR S&P 500 ETF Trust',exchange:'NYSE',mic_code:'ARCX',currency:'USD',last_quote_at:now,close:'765.22',previous_close:'764.00',is_market_open:true,is_extended_hours:false}:{symbol:'USDC/USD',name:'USD Coin US Dollar',exchange:'Binance',last_quote_at:now,close:'1.0001',is_market_open:true}
 else body={status:'ok',meta:{symbol:'SPY',currency:'USD',mic_code:'ARCX',interval:'1min'},values:Array.from({length:90},(_,i)=>({datetime:stamp(open+i*60),open:'765',high:'766',low:'764',close:'765.20'}))}
 change(body,u);return new Response(JSON.stringify(body))
}
assert.equal(twelveStockSession('2026-09-12'),null);assert.equal(twelveStockSession('2026-09-07'),null)
assert.equal(twelveStockSession('2026-11-27').close,Date.parse('2026-11-27T18:00:00Z')/1000)
assert.throws(()=>twelveStockSession('2029-01-02'),/not approved/)
await assert.rejects(()=>readStockTwelveDataReference('',()=>now,15,fetcher),/not configured/);assert.equal(calls.length,0)
const good=await readStockTwelveDataReference('private-key',()=>now,15,fetcher)
assert.equal(good.source,'twelve-data');assert.equal(good.spyUsdE8,76522000000n);assert.equal(good.usdcUsdE8,100010000n);assert.equal(good.observedAt,now);assert.equal(good.fiveMinuteMoveBps,1);assert.equal(calls.length,3)
for(const mutate of [b=>{if(b.symbol==='SPY')b.last_quote_at=now-15},b=>{if(b.symbol==='SPY')b.mic_code='XNAS'},b=>{if(b.symbol==='SPY')b.is_market_open=false},b=>{if(b.symbol==='USDC/USD')b.exchange='Unknown'},b=>{if(b.symbol==='USDC/USD')b.close='0.98'},b=>{if(b.values)b.values.pop()},b=>{if(b.values)b.values[1].datetime=b.values[0].datetime},b=>{if(b.values)b.values[0].high='1'}]){
 change=mutate;await assert.rejects(()=>readStockTwelveDataReference('private-key',()=>now,15,fetcher))
}
change=()=>{};await assert.rejects(()=>readStockTwelveDataReference('private-key',()=>Date.parse('2026-09-12T15:00:00Z')/1000,15,fetcher),/closed/)
console.log('Twelve Data production adapter passed: calendar, identities, session, source freshness, USDC venue/depeg, exact history, risk metrics and fail-closed cases.')
