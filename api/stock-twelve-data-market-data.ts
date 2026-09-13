import {stockBps,stockDecimal,stockFresh,stockNyDate,stockSessionTime,type StockReference} from './stock-market-data.js'
import {stockFailure as fail} from './stock-early-pay-config.js'

type Fetcher=typeof fetch
const BASE='https://api.twelvedata.com/'
// Official NYSE 2026-2028 calendar, reviewed 2026-09-12. Unknown years fail closed.
const HOLIDAYS=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25','2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24','2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25'])
const EARLY_CLOSE=new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24'])
export function twelveStockSession(date:string){
 if(!/^202[6-8]-\d\d-\d\d$/.test(date))fail('Stock calendar year is not approved.',503)
 const day=new Date(date+'T12:00:00Z').getUTCDay()
 if(day===0||day===6||HOLIDAYS.has(date))return null
 return {open:stockSessionTime(date,'09:30'),close:stockSessionTime(date,EARLY_CLOSE.has(date)?'13:00':'16:00')}
}
const stamp=(t:number)=>new Date(t*1000).toISOString().slice(0,19).replace('T',' ')
async function get(path:string,params:Record<string,string>,key:string,fetcher:Fetcher){
 const response=await fetcher(BASE+path+'?'+new URLSearchParams(params),{headers:{accept:'application/json',Authorization:'apikey '+key},signal:AbortSignal.timeout(7000),redirect:'error',cache:'no-store'})
 if(!response.ok||!response.body)fail('Twelve Data is unavailable.',503)
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144)fail('Twelve Data response is too large.',503);chunks.push(value)}}finally{await reader.cancel()}
 let body:any;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('Twelve Data response is invalid.',503)}
 if(body?.status==='error')fail('Twelve Data rejected the request.',503)
 return body
}
const sourceTime=(q:any)=>{if(!Number.isSafeInteger(q?.last_quote_at))fail('Twelve Data source timestamp is missing.',503);return q.last_quote_at as number}
export async function readStockTwelveDataReference(key:string,clock:()=>number,maxAge:number,fetcher:Fetcher=fetch):Promise<StockReference>{
 if(!key)fail('Twelve Data access is not configured.',503)
 let now=clock(),date=stockNyDate(now),session=twelveStockSession(date)
 if(!session||now<session.open||now>=session.close)fail('The regular US stock session is closed.',409)
 const completed=Math.floor(now/60)*60
 if(completed-session.open<360)fail('Waiting for complete regular-session price history.',409)
 const request={symbol:'SPY',country:'United States',type:'ETF',interval:'1min',prepost:'false'}
 const [spy,usdc]=await Promise.all([get('quote',request,key,fetcher),get('quote',{symbol:'USDC/USD',interval:'1min'},key,fetcher)])
 now=clock();date=stockNyDate(now);session=twelveStockSession(date)
 if(!session||now<session.open||now>=session.close)fail('Stock session ended during verification.',409)
 if(spy.symbol!=='SPY'||spy.name!=='State Street SPDR S&P 500 ETF Trust'||spy.exchange!=='NYSE'||spy.mic_code!=='ARCX'||spy.currency!=='USD'||spy.is_market_open!==true||spy.is_extended_hours===true)fail('Twelve Data stock identity or session changed.',503)
 if(usdc.symbol!=='USDC/USD'||usdc.name!=='USD Coin US Dollar'||usdc.exchange!=='Binance'||usdc.is_market_open!==true)fail('Twelve Data USDC identity changed.',503)
 const spyAt=sourceTime(spy),usdcAt=sourceTime(usdc);stockFresh(spyAt,now,maxAge);stockFresh(usdcAt,now,maxAge)
 if(spyAt<session.open)fail('Twelve Data stock quote is outside the session.',409)
 const price=stockDecimal(spy.close),stable=stockDecimal(usdc.close)
 if(stockBps(stable-100000000n,100000000n)>50)fail('USDC/USD is outside the permitted range.',409)
 const history=await get('time_series',{...request,timezone:'UTC',order:'asc',outputsize:'500',start_date:stamp(session.open),end_date:stamp(completed-1)},key,fetcher)
 now=clock();if(stockNyDate(now)!==date||now>=session.close)fail('Stock session ended during price verification.',409)
 stockFresh(spyAt,now,maxAge);stockFresh(usdcAt,now,maxAge)
 const count=(completed-session.open)/60
 if(history.status!=='ok'||history.meta?.symbol!=='SPY'||history.meta?.currency!=='USD'||history.meta?.mic_code!=='ARCX'||history.meta?.interval!=='1min'||!Array.isArray(history.values)||history.values.length!==count)fail('Twelve Data history is incomplete.',503)
 let high=price,low=price;const closes:bigint[]=[]
 history.values.forEach((row:any,i:number)=>{if(row.datetime!==stamp(session!.open+i*60))fail('Twelve Data history has a gap.',503);const o=stockDecimal(row.open),h=stockDecimal(row.high),l=stockDecimal(row.low),c=stockDecimal(row.close);if(l>h||o<l||o>h||c<l||c>h)fail('Twelve Data price bar is invalid.',503);if(h>high)high=h;if(l<low)low=l;closes.push(c)})
 const prior=stockDecimal(spy.previous_close),earlier=closes.at(-6)!
 const observedAt=Math.min(spyAt,usdcAt)
 return {observedAt,expiresAt:Math.min(observedAt+maxAge,session.close),spyUsdE8:price,usdcUsdE8:stable,volatilityBps:stockBps(high-low,prior),fiveMinuteMoveBps:Math.max(stockBps(closes.at(-1)!-earlier,earlier),stockBps(price-earlier,earlier)),sessionOpen:session.open,sessionClose:session.close,source:'twelve-data'}
}
