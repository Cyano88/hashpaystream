import assert from 'node:assert/strict'
import {readStockReference,stockSessionTime,stockJson} from '../api/stock-market-data.ts'
const now=Date.parse('2026-09-11T15:00:10Z')/1000,date='2026-09-11',open=stockSessionTime(date,'09:30'),close=stockSessionTime(date,'16:00')
const iso=t=>new Date(t*1000).toISOString()
const fixtures={clock:{timestamp:iso(now-1),is_open:true,next_close:iso(close)},calendar:[{date:'2026-09-10',open:'09:30',close:'16:00'},{date,open:'09:30',close:'16:00'}],snapshots:{SPY:{dailyBar:{t:date+'T04:00:00Z',h:766,l:764},latestTrade:{t:iso(now-2),p:765},latestQuote:{t:iso(now-1),bp:764.99,ap:765.01}}},history:{bars:{SPY:Array.from({length:90},(_,i)=>({t:iso(open+i*60),h:766,l:764,c:765,o:765}))},next_page_token:null},previous:{bars:{SPY:[{t:'2026-09-10T04:00:00Z',c:765}]}},kraken:{error:[],result:{'USDC/USD':[['1.0000','100',now-2]],last:'0'}}}
let data=structuredClone(fixtures),requests=[]
const fetcher=async(url,options)=>{requests.push([url,options]);let key=url.includes('/clock')?'clock':url.includes('/calendar')?'calendar':url.includes('snapshots')?'snapshots':url.includes('1Day')?'previous':url.includes('kraken')?'kraken':'history';return new Response(JSON.stringify(data[key]),{status:200})}
const credentials={key:'synthetic-key',secret:'synthetic-secret',paper:true}
const result=await readStockReference(credentials,now,15,fetcher)
assert.equal(result.spyUsdE8,76500000000n);assert.equal(result.usdcUsdE8,100000000n);assert.equal(result.observedAt,now-2);assert.equal(result.expiresAt,now+13)
assert.ok(requests.filter(([u])=>u.includes('data.alpaca')).every(([u])=>u.includes('feed=sip')))
assert.ok(!requests.find(([u])=>u.includes('kraken'))[1].headers['APCA-API-KEY-ID'])
for(const mutate of [
 d=>d.clock.is_open=false,d=>d.clock.timestamp=iso(now-16),d=>d.clock.timestamp=iso(now+1),d=>d.calendar.pop(),
 d=>d.calendar[1].close='13:00',d=>d.clock.next_close=iso(close+3600),
 d=>d.snapshots.SPY.latestTrade.t=iso(now-900),d=>d.snapshots.SPY.latestQuote.t=iso(now+1),
 d=>d.snapshots.SPY.latestQuote.bp=0,d=>d.snapshots.SPY.latestQuote.ap=700,
 d=>d.history.bars.SPY.splice(4,1),d=>d.history.bars.SPY[4].t=iso(open),d=>d.history.next_page_token='more',
 d=>d.previous.bars.SPY[0].t='2026-09-09T04:00:00Z',d=>d.previous.bars.SPY[0].c=0,
 d=>d.kraken.error=['unavailable'],d=>d.kraken.result['USDC/USD'][0][2]=now-60,
 d=>d.kraken.result['USDC/USD'][0][0]='0.98',d=>d.kraken.result={'USDT/USD':[['1','1',now]]}
]){data=structuredClone(fixtures);mutate(data);await assert.rejects(()=>readStockReference(credentials,now,15,fetcher))}
data=structuredClone(fixtures)
await assert.rejects(()=>readStockReference({...credentials,key:''},now,15,fetcher),/credentials/)
assert.equal(stockSessionTime('2026-03-06','09:30'),Date.parse('2026-03-06T14:30:00Z')/1000)
assert.equal(stockSessionTime('2026-03-09','09:30'),Date.parse('2026-03-09T13:30:00Z')/1000)
// Early close is accepted only before the actual close; no hardcoded 16:00 override.
data.calendar[1].close='13:00';data.clock.next_close=iso(stockSessionTime(date,'13:00'))
assert.equal((await readStockReference(credentials,now,15,fetcher)).sessionClose,stockSessionTime(date,'13:00'))
await assert.rejects(()=>stockJson('https://example.test',{},async()=>new Response('x'.repeat(262145))),/too large/)
await assert.rejects(()=>stockJson('https://example.test',{},async()=>new Response('{}',{status:403})),/unavailable/)
data=structuredClone(fixtures)
let advancedNow=now
const advancingFetch=async(url,options)=>{advancedNow=now+2;if(url.includes('/clock'))data.clock.timestamp=iso(now+1);return fetcher(url,options)}
assert.ok(await readStockReference(credentials,()=>advancedNow,15,advancingFetch),'provider timestamps are compared with the clock after the fetch')
advancedNow=now
await assert.rejects(()=>readStockReference(credentials,()=>advancedNow,15,async(url,options)=>{const response=await fetcher(url,options);if(url.includes('snapshots'))advancedNow=now+30;return response}),/stale/)
console.log('Independent market data checks passed: SIP selection, timestamps, USDC conversion/depeg, complete history, market closure, early close, DST, missing access and oversized responses.')
