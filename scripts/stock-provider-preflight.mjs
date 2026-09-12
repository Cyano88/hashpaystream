import {readStockPythMetadata,readStockPythReference} from '../api/stock-pyth-market-data.ts'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {writeFileSync} from 'node:fs'
import {stockJson,stockDecimal,stockFresh,stockBps,readStockReference} from '../api/stock-market-data.ts'

// Read-only connectivity and data checks. No wallet, registration, review decision or transaction.
export async function stockProviderPreflight(env=process.env,fetcher=fetch){
 let config;try{config=JSON.parse(env.HASHPAYSTREAM_STOCK_CONFIG??'null')}catch{}
 const provider=config?.marketDataProvider??'pyth-pro'
 const report={schema:1,checkedAt:new Date().toISOString(),productionReady:false,mainnetTransaction:false,checks:{},blockers:[]}
 const check=async(name,fn)=>{try{report.checks[name]=await fn()}catch(error){report.checks[name]={status:'FAILED',reason:error.status?error.message:(typeof error.cause?.code==='string'?error.cause.code:error.name??'REQUEST_FAILED')};report.blockers.push(name+' verification failed')}}
 await Promise.all([
  check('publicFeedMetadata',async()=>{
   if(provider==='pyth-pro'){const feeds=await readStockPythMetadata(fetcher);return {status:'VERIFIED',source:'pyth-pro',feeds:feeds.map(f=>({symbol:f.symbol,id:f.pyth_lazer_id}))}}
   if(provider!=='alpaca-sip')throw Error('Unsupported provider')
   const body=await stockJson('https://api.kraken.com/0/public/Trades?pair=USDCUSD&count=1&assetVersion=1',{},fetcher)
   const trades=body.result?.['USDC/USD']
   if(!Array.isArray(body.error)||body.error.length||!Array.isArray(trades)||trades.length!==1||typeof trades[0][2]!=='number')throw Error('Invalid pair response')
   const observedAt=Math.floor(trades[0][2]),now=Math.floor(Date.now()/1000),price=stockDecimal(trades[0][0]);stockFresh(observedAt,now,15)
   if(stockBps(price-100000000n,100000000n)>50)throw Error('Outside depeg policy')
   return {status:'VERIFIED',pair:'USDC/USD',observedAt,ageSeconds:now-observedAt}
  }),
  check('issuerAvailability',async()=>{
   const body=await stockJson('https://api.backed.fi/api/v2/public/assets/SPYx',{},fetcher)
   if(typeof body.trading?.openNow!=='boolean'||typeof body.isTradingHalted!=='boolean')throw Error('Invalid issuer response')
   return {status:'VERIFIED',openNow:body.trading.openNow,halted:body.isTradingHalted,nextChangeAt:body.trading.nextChangeAt}
  })
 ])
 const key=env.HASHPAYSTREAM_ALPACA_KEY,secret=env.HASHPAYSTREAM_ALPACA_SECRET
 if(report.checks.issuerAvailability?.openNow===false||report.checks.issuerAvailability?.halted===true)report.blockers.push('Issuer currently reports trading closed or halted')
 if(provider==='pyth-pro'){
  if(!env.HASHPAYSTREAM_PYTH_PRO_KEY){report.checks.independentStockData={status:'NOT_CONFIGURED',source:provider};report.blockers.push('Pyth Pro key and equity data entitlement are not configured in this process')}
  else await check('independentStockData',async()=>{const r=await readStockPythReference(env.HASHPAYSTREAM_PYTH_PRO_KEY,()=>Math.floor(Date.now()/1000),15,fetcher);return {status:'VERIFIED',source:r.source,observedAt:r.observedAt,expiresAt:r.expiresAt}})
 }else if(provider!=='alpaca-sip'){report.blockers.push('Unsupported market data provider')}
 else if(!key||!secret){report.checks.independentStockData={status:'NOT_CONFIGURED'};report.blockers.push('Alpaca data credentials and SIP entitlement are not configured in this process')}
 else await check('independentStockData',async()=>{const reference=await readStockReference({key,secret,paper:env.HASHPAYSTREAM_ALPACA_PAPER==='true'},()=>Math.floor(Date.now()/1000),15,fetcher);return {status:'VERIFIED',source:reference.source,observedAt:reference.observedAt,expiresAt:reference.expiresAt,sessionClose:reference.sessionClose}})
 report.checks.participantAndAssetReview={status:'NOT_VERIFIED',endpointConfigured:Boolean(config?.riskUrl),authenticationConfigured:Boolean(env.HASHPAYSTREAM_STOCK_RISK_ADAPTER_TOKEN),decisionsVerified:false}
 report.blockers.push('Real participant and corporate-action decisions have not been verified; no synthetic scope was sent to a live review service')
 report.blockers.push('Security review, owner/signers and deployment approval remain separate release gates')
 return report
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await stockProviderPreflight()
 writeFileSync('docs/evidence/stock-provider-preflight.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report,null,2))
 if(report.blockers.length)process.exitCode=2
}
