import { stockFailure as fail } from './stock-early-pay-config.js'

// Fixed provider origins; redirects, oversized bodies and cached/stale evidence fail closed.
export async function stockJson(url:string,headers:Record<string,string>={},fetcher:typeof fetch=fetch,body?:unknown):Promise<any>{
 const response=await fetcher(url,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:JSON.stringify(body),headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'}),...headers},signal:AbortSignal.timeout(7000),redirect:'error',cache:'no-store'})
 if(!response.ok||!response.body)fail('Stock market data is unavailable.',503)
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144)fail('Stock market data is too large.',503);chunks.push(value)}}finally{await reader.cancel()}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('Stock market data is invalid.',503)}
}
export function stockTimestamp(value:unknown):number{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value))fail('Market timestamp is missing.',503)
 const t=Math.floor(Date.parse(value)/1000);if(!Number.isSafeInteger(t)||t<=0)fail('Market timestamp is invalid.',503);return t
}
export function stockFresh(t:number,now:number,age:number){if(!Number.isSafeInteger(t)||t<=0||t>now||now-t>=age)fail('Market evidence is stale or future-dated.',503)}
export function stockDecimal(value:unknown):bigint{
 const s=String(value);if(!/^(0|[1-9]\d{0,9})(\.\d{1,8})?$/.test(s))fail('Market price is invalid.',503)
 const [a,b='']=s.split('.'),n=BigInt(a)*100000000n+BigInt(b.padEnd(8,'0'));if(n<=0n)fail('Market price must be positive.',503);return n
}
export const stockBps=(difference:bigint,base:bigint)=>Number(((difference<0n?-difference:difference)*10000n+base-1n)/base)
const nyParts=(t:number)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(t*1000).map(p=>[p.type,p.value]))
export function stockNyDate(t:number){const p=nyParts(t);return p.year+'-'+p.month+'-'+p.day}
export function stockSessionTime(date:string,time:string){
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^\d\d:\d\d$/.test(time))fail('Market calendar is invalid.',503)
 const guess=Date.parse(date+'T'+time+':00Z')/1000,p=nyParts(guess)
 const offset=Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':00Z')/1000-guess
 const result=guess-offset;if(!Number.isSafeInteger(result)||stockNyDate(result)!==date)fail('Market calendar date is invalid.',503);return result
}
export type StockReference={observedAt:number;expiresAt:number;spyUsdE8:bigint;usdcUsdE8:bigint;volatilityBps:number;fiveMinuteMoveBps:number;sessionOpen:number;sessionClose:number;source:'alpaca-sip+kraken'|'pyth-pro'}
export type StockDataCredentials={key:string;secret:string;paper:boolean}
export async function readStockReference(credentials:StockDataCredentials,nowInput:number|(()=>number),maxAge:number,fetcher:typeof fetch=fetch):Promise<StockReference>{
 const currentNow=typeof nowInput==='function'?nowInput:()=>nowInput
 let now=currentNow()
 if(!credentials.key||!credentials.secret)fail('Independent stock data credentials are missing.',503)
 const headers={'APCA-API-KEY-ID':credentials.key,'APCA-API-SECRET-KEY':credentials.secret}
 const base=credentials.paper?'https://paper-api.alpaca.markets':'https://api.alpaca.markets'
 const date=stockNyDate(now),startDate=stockNyDate(now-14*86400)
 const [clock,calendar]=await Promise.all([stockJson(base+'/v2/clock',headers,fetcher),stockJson(base+'/v2/calendar?start='+startDate+'&end='+date+'&date_type=TRADING',headers,fetcher)])
 now=currentNow()
 const clockAt=stockTimestamp(clock.timestamp);stockFresh(clockAt,now,maxAge)
 if(clock.is_open!==true||!Array.isArray(calendar))fail('The regular US market session is closed.',409)
 const today=calendar.filter((d:any)=>d.date===date),prior=calendar.filter((d:any)=>typeof d.date==='string'&&d.date<date).sort((a:any,b:any)=>a.date.localeCompare(b.date))
 if(today.length!==1||!prior.length)fail('Market calendar coverage is missing.',503)
 const open=stockSessionTime(date,today[0].open),close=stockSessionTime(date,today[0].close)
 if(today[0].open!=='09:30'||close>stockSessionTime(date,'16:00')||close<=open||now<open||now>=close||stockTimestamp(clock.next_close)!==close)fail('Outside the verified regular market session.',409)
 const completed=Math.floor(now/60)*60
 if(completed-open<6*60)fail('Waiting for complete regular-session price history.',409)
 const [snapshots,history,previous,kraken]=await Promise.all([
  stockJson('https://data.alpaca.markets/v2/stocks/snapshots?symbols=SPY&feed=sip&currency=USD',headers,fetcher),
  stockJson('https://data.alpaca.markets/v2/stocks/bars?symbols=SPY&timeframe=1Min&feed=sip&currency=USD&adjustment=all&sort=asc&limit=1000&start='+encodeURIComponent(new Date(open*1000).toISOString())+'&end='+encodeURIComponent(new Date((completed-1)*1000).toISOString()),headers,fetcher),
  stockJson('https://data.alpaca.markets/v2/stocks/bars?symbols=SPY&timeframe=1Day&feed=sip&currency=USD&adjustment=all&sort=desc&limit=1&start='+prior.at(-1).date+'&end='+prior.at(-1).date+'T23:59:59Z',headers,fetcher),
  stockJson('https://api.kraken.com/0/public/Trades?pair=USDCUSD&count=1&assetVersion=1',{},fetcher)
 ])
 now=currentNow()
 if(stockNyDate(now)!==date||now>=close)fail('Market session ended during verification.',409)
 stockFresh(clockAt,now,maxAge)
 const s=snapshots.SPY,tradeAt=stockTimestamp(s?.latestTrade?.t),quoteAt=stockTimestamp(s?.latestQuote?.t)
 stockFresh(tradeAt,now,maxAge);stockFresh(quoteAt,now,maxAge)
 const bid=stockDecimal(s.latestQuote.bp),ask=stockDecimal(s.latestQuote.ap),trade=stockDecimal(s.latestTrade.p)
 if(ask<bid||stockBps(ask-bid,bid)>50||tradeAt<open||quoteAt<open)fail('Independent quote is inconsistent.',503)
 const price=(bid+ask)/2n
 if(stockBps(trade-price,price)>50)fail('Independent trade and quote disagree.',503)
 const bars=history.bars?.SPY,prev=previous.bars?.SPY
 if(history.next_page_token||!Array.isArray(bars)||bars.length!==(completed-open)/60||!Array.isArray(prev)||prev.length!==1||stockNyDate(stockTimestamp(prev[0].t))!==prior.at(-1).date)fail('Independent price history is incomplete.',503)
 if(stockNyDate(stockTimestamp(s.dailyBar?.t))!==date)fail('Current daily range is missing.',503)
 const dailyHigh=stockDecimal(s.dailyBar.h),dailyLow=stockDecimal(s.dailyBar.l)
 if(dailyHigh<dailyLow)fail('Daily range is invalid.',503)
 let high=dailyHigh>ask?dailyHigh:ask,low=dailyLow<bid?dailyLow:bid
 if(trade>high)high=trade;if(trade<low)low=trade
 const closes:bigint[]=[]
 bars.forEach((b:any,i:number)=>{if(stockTimestamp(b.t)!==open+i*60)fail('Price history has a gap.',503);const h=stockDecimal(b.h),l=stockDecimal(b.l),c=stockDecimal(b.c),o=stockDecimal(b.o);if(h<l||c<l||c>h||o<l||o>h)fail('Price bar is invalid.',503);if(h>high)high=h;if(l<low)low=l;closes.push(c)})
 const rows=kraken.result?.['USDC/USD'];if(!Array.isArray(kraken.error)||kraken.error.length||!Array.isArray(rows)||rows.length!==1||typeof rows[0][2]!=='number')fail('USDC/USD reference is unavailable.',503)
 const usdAt=Math.floor(rows[0][2]);stockFresh(usdAt,now,maxAge)
 const usdc=stockDecimal(rows[0][0]);if(stockBps(usdc-100000000n,100000000n)>50)fail('USDC/USD is outside the permitted range.',409)
 const observedAt=Math.min(clockAt,tradeAt,quoteAt,usdAt)
 return {observedAt,expiresAt:Math.min(observedAt+maxAge,close),spyUsdE8:price,usdcUsdE8:usdc,volatilityBps:stockBps(high-low,stockDecimal(prev[0].c)),fiveMinuteMoveBps:Math.max(stockBps(closes.at(-1)!-closes.at(-6)!,closes.at(-6)!),stockBps(price-closes.at(-6)!,closes.at(-6)!)),sessionOpen:open,sessionClose:close,source:'alpaca-sip+kraken'}
}
