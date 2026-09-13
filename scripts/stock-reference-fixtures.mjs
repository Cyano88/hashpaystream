import {readFileSync} from 'node:fs'
// Synthetic provider responses for the local actual-token rehearsal only.
export function stockReferenceFixtures(now){
 const date=new Date(now*1000).toISOString().slice(0,10),open=Date.parse(date+'T13:30:00Z')/1000,close=Date.parse(date+'T20:00:00Z')/1000
 const iso=t=>new Date(t*1000).toISOString()
 return async url=>{
  let body
  if(url.includes('/clock'))body={timestamp:iso(now),is_open:true,next_close:iso(close)}
  else if(url.includes('/calendar'))body=[{date:'2026-09-11',open:'09:30',close:'16:00'},{date,open:'09:30',close:'16:00'}]
  else if(url.includes('snapshots'))body={SPY:{dailyBar:{t:date+'T04:00:00Z',h:766,l:764},latestTrade:{t:iso(now),p:765.22},latestQuote:{t:iso(now),bp:765.21,ap:765.23}}}
  else if(url.includes('kraken'))body={error:[],result:{'USDC/USD':[['1.00000000','100',now]]}}
  else if(url.includes('1Day'))body={bars:{SPY:[{t:'2026-09-11T04:00:00Z',c:765.22}]}}
  else body={bars:{SPY:Array.from({length:(Math.floor(now/60)*60-open)/60},(_,i)=>({t:iso(open+i*60),o:765.22,c:765.22,h:766,l:764}))},next_page_token:null}
  return new Response(JSON.stringify(body))
 }
}

export function stockPythReferenceFixtures(now){
 const metadata=JSON.parse(readFileSync('docs/evidence/stock-pyth-candidate.json','utf8')).feeds
 return async(url)=>{
  let body
  if(url.includes('/symbols?'))body=[metadata[url.includes('query=SPY')?0:1]]
  else if(url.includes('latest_price'))body={parsed:{timestampUs:String(now*1e6),priceFeeds:[{priceFeedId:1398,exponent:-5,price:'76522000'},{priceFeedId:7,exponent:-8,price:'100000000'}].map(f=>({...f,confidence:'1000',publisherCount:3,marketSession:'regular',feedUpdateTimestamp:String(now*1e6)}))}}
  else {const u=new URL(url),from=Number(u.searchParams.get('from')),to=Number(u.searchParams.get('to')),count=Math.floor((to-from)/60)+1;body={s:'ok',t:Array.from({length:count},(_,i)=>from+i*60),o:Array(count).fill(765.22),h:Array(count).fill(766),l:Array(count).fill(764),c:Array(count).fill(765.22)}}
  return new Response(JSON.stringify(body))
 }
}

export function stockTwelveDataReferenceFixtures(now){
 const date=new Date(now*1000).toISOString().slice(0,10),open=Date.parse(date+'T13:30:00Z')/1000
 const stamp=t=>new Date(t*1000).toISOString().slice(0,19).replace('T',' ')
 return async(url,options)=>{
  if(options.headers.Authorization!=='apikey synthetic')throw Error('Fixture credential mismatch')
  const u=new URL(url),symbol=u.searchParams.get('symbol');let body
  if(u.pathname.endsWith('/quote'))body=symbol==='SPY'?{symbol:'SPY',name:'State Street SPDR S&P 500 ETF Trust',exchange:'NYSE',mic_code:'ARCX',currency:'USD',last_quote_at:now,close:'765.22',previous_close:'765.22',is_market_open:true,is_extended_hours:false}:{symbol:'USDC/USD',name:'USD Coin US Dollar',exchange:'Binance',last_quote_at:now,close:'1.00000000',is_market_open:true}
  else body={status:'ok',meta:{symbol:'SPY',currency:'USD',mic_code:'ARCX',interval:'1min'},values:Array.from({length:(Math.floor(now/60)*60-open)/60},(_,i)=>({datetime:stamp(open+i*60),open:'765.22',high:'766',low:'764',close:'765.22'}))}
  return new Response(JSON.stringify(body))
 }
}
