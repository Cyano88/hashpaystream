import {stockJson,stockFresh,stockBps,stockDecimal,stockNyDate,stockSessionTime,type StockReference} from './stock-market-data.js'
import {stockFailure as fail} from './stock-early-pay-config.js'

export const STOCK_PYTH_FEEDS=[{symbol:'Equity.US.SPY/USD',id:1398,exponent:-5,assetType:'equity',query:'SPY'},{symbol:'Crypto.USDC/USD',id:7,exponent:-8,assetType:'crypto',query:'USDC'}] as const
export const STOCK_PYTH_CHANNEL='fixed_rate@1000ms'
export async function readStockPythMetadata(fetcher:typeof fetch=fetch){
 return Promise.all(STOCK_PYTH_FEEDS.map(async expected=>{
  const data=await stockJson('https://pyth.dourolabs.app/v1/symbols?query='+expected.query+'&asset_type='+expected.assetType,{},fetcher)
  if(!Array.isArray(data))fail('Pyth feed metadata is invalid.',503)
  const matches=data.filter(f=>f.symbol===expected.symbol),f=matches[0]
  if(matches.length!==1||f.pyth_lazer_id!==expected.id||f.exponent!==expected.exponent||f.asset_type!==expected.assetType||f.instrument_type!=='spot'||f.quote_currency!=='USD'||f.state!=='stable'||f.market_sessions?.regular?.state!=='stable'||!Number.isSafeInteger(f.market_sessions.regular.min_pub)||f.market_sessions.regular.min_pub<3||f.schedule!==f.market_sessions.regular.schedule||f.schedule!==f.market_session_schedule?.regular||!['real_time','fixed_rate@50ms','fixed_rate@200ms','fixed_rate@1000ms'].includes(f.min_channel))fail('Pyth feed identity or regular-session quality changed.',503)
  return f
 }))
}
/** Regular US session only. Unknown calendar syntax is never guessed. Metadata is refreshed per read. */
export function pythStockSession(schedule:unknown,date:string):{open:number;close:number}|null{
 if(typeof schedule!=='string'||schedule.length>10000)fail('Pyth schedule is missing.',503)
 const parts=schedule.split(';');if(parts.length!==3||parts[0]!=='America/New_York')fail('Pyth schedule is unsupported.',503)
 const week=parts[1].split(',');if(week.length!==7||week.some(day=>day!=='C'&&!/^0930-(1300|1600)$/.test(day)))fail('Pyth regular schedule changed.',503)
 const exceptions=new Map<string,string>()
 for(const item of parts[2]?parts[2].split(','):[]){const [day,hours,...rest]=item.split('/');if(rest.length||!/^\d{4}$/.test(day)||exceptions.has(day)||hours!=='C'&&!/^0930-(1300|1600)$/.test(hours))fail('Pyth holiday schedule is invalid.',503);exceptions.set(day,hours)}
 const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7,day=exceptions.get(date.slice(5).replace('-',''))??week[weekday]
 if(day==='C')return null
 return {open:stockSessionTime(date,'09:30'),close:stockSessionTime(date,day.slice(5,7)+':'+day.slice(7,9))}
}
const integer=(v:unknown):bigint=>{if(typeof v==='number'&&!Number.isSafeInteger(v)||!['string','number'].includes(typeof v)||!/^\d{1,19}$/.test(String(v)))fail('Pyth integer field is invalid.',503);return BigInt(String(v))}
export function parseStockPythPrices(payload:any,metadata:any[],now:number,maxAge:number){
 const parsed=payload?.parsed,rows=parsed?.priceFeeds
 if(!Array.isArray(rows)||rows.length!==2)fail('Both Pyth price feeds are required.',503)
 const envelope=integer(parsed.timestampUs);stockFresh(Number(envelope/1000000n),now,maxAge)
 return STOCK_PYTH_FEEDS.map((expected,i)=>{
  const matches=rows.filter(f=>f.priceFeedId===expected.id),f=matches[0]
  if(matches.length!==1||f.exponent!==expected.exponent||f.marketSession!=='regular'||!Number.isSafeInteger(f.publisherCount)||f.publisherCount<Math.max(3,metadata[i].market_sessions.regular.min_pub))fail('Pyth price identity, session or publisher threshold failed.',409)
  const timestamp=integer(f.feedUpdateTimestamp),observedAt=Number(timestamp/1000000n)
  if(timestamp>envelope)fail('Pyth source timestamp exceeds its envelope.',503)
  stockFresh(observedAt,now,maxAge)
  const price=integer(f.price),confidence=integer(f.confidence)
  if(price<=0n||stockBps(confidence,price)>50)fail('Pyth price confidence is outside the limit.',409)
  return {priceE8:price*10n**BigInt(8+expected.exponent),observedAt}
 })
}
function candles(body:any,from:number,count:number){
 if(body?.s!=='ok'||!['t','o','h','l','c'].every(k=>Array.isArray(body[k])&&body[k].length===count)||count<1)fail('Pyth minute history is incomplete.',503)
 return body.t.map((t:unknown,i:number)=>{
  if(t!==from+i*60)fail('Pyth minute history has a gap.',503)
  const o=stockDecimal(body.o[i]),h=stockDecimal(body.h[i]),l=stockDecimal(body.l[i]),c=stockDecimal(body.c[i])
  if(l>h||o<l||o>h||c<l||c>h)fail('Pyth candle is inconsistent.',503)
  return {h,l,c}
 }) as {h:bigint;l:bigint;c:bigint}[]
}
export async function readStockPythReference(key:string,clock:()=>number,maxAge:number,fetcher:typeof fetch=fetch):Promise<StockReference>{
 if(!key)fail('Pyth Pro data access is not configured.',503)
 const metadata=await readStockPythMetadata(fetcher),date=stockNyDate(clock()),session=pythStockSession(metadata[0].schedule,date)
 if(!session||clock()<session.open||clock()>=session.close)fail('The regular US stock session is closed.',409)
 const completed=Math.floor(clock()/60)*60
 if(completed-session.open<360)fail('Waiting for complete regular-session price history.',409)
 const actions=metadata[0].corporate_actions
 if(actions!==undefined&&!Array.isArray(actions))fail('Pyth corporate-action metadata is invalid.',503)
 for(const action of actions??[]){const ex=action.activation?.us_equity_ex_date?.ex_date;if(typeof ex!=='string'||!/^\d{4}-\d\d-\d\d$/.test(ex)||ex>=stockNyDate(clock()-14*86400)&&ex<=stockNyDate(clock()+7*86400))fail('Pyth corporate action needs review before stock funding.',409)}
 let previous:{open:number;close:number}|null=null
 for(let days=1;days<=14&&!previous;days++)previous=pythStockSession(metadata[0].schedule,stockNyDate(session.open-days*86400))
 if(!previous)fail('Previous regular stock session is unavailable.',503)
 const headers={authorization:'Bearer '+key},base='https://pyth.dourolabs.app/v1/'+STOCK_PYTH_CHANNEL
 const history=(from:number,to:number)=>stockJson(base+'/history?symbol=Equity.US.SPY%2FUSD&resolution=1&from='+from+'&to='+to,headers,fetcher)
 const [latest,day,last]=await Promise.all([
  stockJson('https://pyth-lazer.dourolabs.app/v1/latest_price',headers,fetcher,{priceFeedIds:STOCK_PYTH_FEEDS.map(f=>f.id),properties:['price','confidence','exponent','publisherCount','marketSession','feedUpdateTimestamp'],formats:[],channel:STOCK_PYTH_CHANNEL}),
  history(session.open,completed-1),history(previous.close-60,previous.close-1)
 ])
 const now=clock();if(stockNyDate(now)!==date||now>=session.close)fail('Stock session ended during price verification.',409)
 const [spy,usdc]=parseStockPythPrices(latest,metadata,now,maxAge)
 if(spy.observedAt<session.open||stockBps(usdc.priceE8-100000000n,100000000n)>50)fail('Pyth source is outside the stock session or USDC depeg limit.',409)
 const bars=candles(day,session.open,(completed-session.open)/60),prior=candles(last,previous.close-60,1)[0].c
 let high=spy.priceE8,low=spy.priceE8
 for(const b of bars){if(b.h>high)high=b.h;if(b.l<low)low=b.l}
 const earlier=bars.at(-6)!.c,observedAt=Math.min(spy.observedAt,usdc.observedAt)
 return {observedAt,expiresAt:Math.min(observedAt+maxAge,session.close),spyUsdE8:spy.priceE8,usdcUsdE8:usdc.priceE8,volatilityBps:stockBps(high-low,prior),fiveMinuteMoveBps:Math.max(stockBps(bars.at(-1)!.c-earlier,earlier),stockBps(spy.priceE8-earlier,earlier)),sessionOpen:session.open,sessionClose:session.close,source:'pyth-pro'}
}
