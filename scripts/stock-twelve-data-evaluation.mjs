import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {writeFileSync} from 'node:fs'
import {stockJson,stockDecimal,stockFresh,stockBps,stockNyDate,stockSessionTime} from '../api/stock-market-data.ts'

// Internal read-only candidate evaluation. Never used by the stock API or risk signer.
export async function evaluateTwelveData(env=process.env,fetcher=fetch,clock=()=>Math.floor(Date.now()/1000)){
 const report={schema:1,checkedAt:new Date(clock()*1000).toISOString(),provider:'twelve-data',internalEvaluationOnly:true,productionReady:false,providerSwitched:false,requests:0,checks:{},blockers:[]}
 const key=env.HASHPAYSTREAM_TWELVE_DATA_KEY
 if(!key){report.checks.access={status:'NOT_CONFIGURED'};report.blockers.push('Configure HASHPAYSTREAM_TWELVE_DATA_KEY server-side to run live evaluation.');return report}
 const get=async(path,params)=>{report.requests++;const body=await stockJson('https://api.twelvedata.com/'+path+'?'+new URLSearchParams(params),{Authorization:'apikey '+key},fetcher);if(body?.status==='error')throw Error('PROVIDER_REJECTED');return body}
 const check=async(name,fn)=>{try{report.checks[name]=await fn()}catch{report.checks[name]={status:'NOT_VERIFIED',reason:'Source unavailable, incomplete or outside evaluation limits'};report.blockers.push(name+' did not pass')}}
 await check('spyQuote',async()=>{
  const q=await get('quote',{symbol:'SPY',country:'United States',type:'ETF',interval:'1min',prepost:'false'})
  if(q.symbol!=='SPY'||q.currency!=='USD'||q.mic_code!=='ARCX')throw Error('IDENTITY')
  stockDecimal(q.close);stockDecimal(q.previous_close)
  if(q.is_market_open===false){report.blockers.push('SPY market closed; regular-session freshness not verified.');return {status:'MARKET_CLOSED',accessVerified:true,symbol:q.symbol,mic:q.mic_code,barTimestamp:q.timestamp,reportedLastQuoteAt:Number.isSafeInteger(q.last_quote_at)?q.last_quote_at:null,timestampSemanticsVerified:false}}
  const now=clock();stockFresh(q.last_quote_at,now,15)
  if(q.is_market_open!==true||q.is_extended_hours===true)throw Error('CLOSED')
  return {status:'OBSERVED',symbol:q.symbol,mic:q.mic_code,barTimestamp:q.timestamp,reportedLastQuoteAt:q.last_quote_at,ageSeconds:now-q.last_quote_at,timestampSemanticsVerified:false}
 })
 await check('usdcQuote',async()=>{
  const q=await get('quote',{symbol:'USDC/USD',interval:'1min'})
  if(q.symbol!=='USDC/USD')throw Error('IDENTITY')
  let fresh=false;try{stockFresh(q.last_quote_at,clock(),15);fresh=true}catch{}
  if(!fresh)report.blockers.push('USDC source time is missing, stale or future-dated.')
  if(stockBps(stockDecimal(q.close)-100000000n,100000000n)>50)throw Error('DEPEG')
  return {status:fresh?'OBSERVED':'STALE_OR_MISSING_SOURCE_TIME',accessVerified:true,symbol:q.symbol,barTimestamp:q.timestamp,reportedLastQuoteAt:Number.isSafeInteger(q.last_quote_at)?q.last_quote_at:null,timestampSemanticsVerified:false,venueIdentityVerified:false}
 })
 await check('currentSessionMinutes',async()=>{
  const now=clock(),date=stockNyDate(now),open=stockSessionTime(date,'09:30'),completed=Math.floor(now/60)*60
  // This bounds the candidate probe only; it does not certify an exchange calendar.
  if(completed<open+360||completed>stockSessionTime(date,'16:00'))throw Error('OUTSIDE_WINDOW')
  const stamp=t=>new Date(t*1000).toISOString().slice(0,19).replace('T',' ')
  const b=await get('time_series',{symbol:'SPY',country:'United States',type:'ETF',interval:'1min',timezone:'UTC',order:'asc',outputsize:'500',prepost:'false',start_date:stamp(open),end_date:stamp(completed-1)})
  if(b.status!=='ok'||b.meta?.symbol!=='SPY'||b.meta?.currency!=='USD'||b.meta?.mic_code!=='ARCX'||b.meta?.interval!=='1min'||!Array.isArray(b.values)||b.values.length!==(completed-open)/60)throw Error('HISTORY')
  b.values.forEach((r,i)=>{if(r.datetime!==stamp(open+i*60))throw Error('GAP');const o=stockDecimal(r.open),h=stockDecimal(r.high),l=stockDecimal(r.low),c=stockDecimal(r.close);if(l>h||o<l||o>h||c<l||c>h)throw Error('OHLC')})
  return {status:'OBSERVED',barCount:b.values.length,firstBar:open,lastCompleteBar:completed-60,calendarVerified:false}
 })
 report.blockers.push('Source timestamp semantics, holiday/early-close calendar, previous-session history and corporate-action handling require separate verification.')
 report.blockers.push('Customer-facing derived valuation rights, exact data entitlement and total price remain unconfirmed.')
 return report
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await evaluateTwelveData();writeFileSync('docs/evidence/stock-twelve-data-evaluation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.blockers.length)process.exitCode=2
}
