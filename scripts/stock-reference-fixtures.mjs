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
