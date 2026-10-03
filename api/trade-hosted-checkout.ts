import {parseUnits} from 'viem'
const ORIGIN='https://app.hashpaylink.com'
function fail(status:number,message:string):never{throw Object.assign(Error(message),{status})}
export type HostedTradeReservation={kind:'hosted-trade-v1'|'hosted-trade-arc-v1';walletAppId:string;idempotencyKey:string;request:{kind:'trade';amount:string;paymentToken:string;trade:{offerId:string;snapshotHash:string};[key:string]:unknown}}
export const isHostedTradeKind=(kind:unknown)=>kind==='hosted-trade-v1'||kind==='hosted-trade-arc-v1'
export async function hostedTradeCheckout(reservation:HostedTradeReservation,env:NodeJS.ProcessEnv){
  if(!isHostedTradeKind(reservation.kind))fail(400,'Unsupported hosted Trade reservation.')
  const arc=reservation.kind==='hosted-trade-arc-v1'
  if(arc&&(reservation.request.paymentRail!=='arc'||reservation.request.chainId!==5042||reservation.request.paymentToken!=='0x3600000000000000000000000000000000000000'||reservation.request.stockCustody!==undefined||!/^\d{1,10}\.\d{2,6}$/.test(reservation.request.amount)))fail(400,'Invalid Arc Trade reservation.')
  if(!arc&&((reservation.request.paymentRail!==undefined&&reservation.request.paymentRail!=='xlayer')||(reservation.request.chainId!==undefined&&reservation.request.chainId!==196)))fail(400,'Invalid stock Trade reservation.')
  const endpoint=arc?'/api/v2/trade-agreements':'/api/v2/xstocks-agreements'
  const apiKey=(arc?env.HASHPAYSTREAM_ARC_TRADE_API_KEY:env.HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY)?.trim()
  if(!apiKey||!/^hpl_app_[a-f0-9]{64}$/.test(apiKey))fail(503,'Hosted Trade is not configured.')
  const call=async(method:string,path:string,body?:unknown)=>{
    const response=await fetch(ORIGIN+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey!,'content-type':'application/json','idempotency-key':reservation.idempotencyKey},...(body?{body:JSON.stringify(body)}:{})})
    const data=await response.json().catch(()=>fail(502,'Checkout service is unavailable. Try again.'))
    return {response,data,method}
  }
  let result=await call('GET',endpoint+'?idempotencyKey='+encodeURIComponent(reservation.idempotencyKey)+'&reconcile=true')
  if(result.response.status===404){
    if(arc&&(env.HASHPAYSTREAM_TRADE_HOSTED_ENABLED!=='true'||env.HASHPAYSTREAM_TRADE_ARC_ENABLED!=='true'))fail(409,'New Arc Trade checkout is paused. Existing checkout recovery remains available.')
    result=await call('POST',endpoint,reservation.request)
  }
  const {response,data}=result
  if(!response.ok||data.ok!==true)fail(response.status===409?409:502,response.status===409?'New Trade checkout is currently paused. Existing escrow recovery remains available.':'Could not open hosted checkout. Try again.')
  if(result.method==='GET'&&(typeof data.observation?.pending!=='boolean'||!Number.isFinite(Date.parse(data.observation?.checkedAt))))fail(502,'Payment status could not be verified. Try again.')
  const agreement=data.agreement
  if(!agreement||!(arc?/^tag_[a-f0-9]{64}$/:/^xag_[a-f0-9]{64}$/).test(agreement.id)||agreement.walletAppId!==reservation.walletAppId||agreement.checkoutPath!==(arc?'/agreements/trade/':'/agreements/xstocks/')+agreement.id
    ||agreement.terms?.kind!=='trade'||agreement.terms.trade?.offerId!==reservation.request.trade.offerId||agreement.terms.trade?.snapshotHash!==reservation.request.trade.snapshotHash
    ||(reservation.request.stockCustody!==undefined&&agreement.terms.stockCustody?.policy!==reservation.request.stockCustody)
    ||agreement.terms.amount!==reservation.request.amount||(arc?agreement.terms.payment?.token:agreement.terms.xlayerPayment?.token)?.toLowerCase()!==reservation.request.paymentToken.toLowerCase())fail(502,'The checkout does not match the accepted Trade.')
  if(arc&&(agreement.terms.payment?.policy!=='trade-arc-usdc-v1'||agreement.terms.payment?.rail!=='arc'||agreement.terms.payment?.chainId!==5042||agreement.terms.payment?.decimals!==6
    ||agreement.terms.stockCustody!==undefined||agreement.terms.xlayerPayment!==undefined||agreement.terms.payment?.amountUnits!==parseUnits(reservation.request.amount,6).toString()
    ||Object.entries(reservation.request.trade).some(([name,value])=>agreement.terms.trade?.[name]!==value)
    ||agreement.terms.title!==reservation.request.title||agreement.terms.description!==reservation.request.description))fail(502,'The checkout does not match the accepted Arc Trade.')
  const seen=data.observation,checked=Date.parse(seen?.checkedAt),fundBy=agreement.binding?.contractTerms?.fundBy;
  const canCloseExpired=result.method==='GET' && seen?.pending===false && seen?.fundingExpired===true
    && seen.escrow==='0x0000000000000000000000000000000000000000' && /^[1-9][0-9]{0,77}$/.test(seen.observedBlock||'')
    && agreement.observed?.state===undefined && Number.isSafeInteger(fundBy) && fundBy>0 && fundBy*1000<=Date.now()
    && checked<=Date.now()+5000 && checked>=Date.now()-60000;
  const expiry=canCloseExpired?{fundingExpired:true as const,escrow:seen.escrow,observedBlock:seen.observedBlock,checkedAt:seen.checkedAt,fundBy}:undefined;
  return {canCloseExpired,expiry,checkoutUrl:ORIGIN+agreement.checkoutPath,state:agreement.observed?.state,observedBlock:agreement.observed?.observedBlock,pending:data.observation?.pending===true}
}

export async function hostedArcTradeAvailable(env:NodeJS.ProcessEnv):Promise<boolean>{
  if(env.HASHPAYSTREAM_TRADE_HOSTED_ENABLED!=='true'||env.HASHPAYSTREAM_TRADE_ARC_ENABLED!=='true')return false
  const apiKey=env.HASHPAYSTREAM_ARC_TRADE_API_KEY?.trim()
  if(!apiKey||!/^hpl_app_[a-f0-9]{64}$/.test(apiKey))return false
  const response=await fetch(ORIGIN+'/api/v2/trade-agreements?purpose=availability',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'x-api-key':apiKey}})
  const data=await response.json()
  if(!response.ok||data.ok!==true||data.chainId!==5042||data.paymentRail!=='arc'||typeof data.enabled!=='boolean')fail(502,'Arc payment availability could not be verified.')
  return data.enabled
}
export async function hostedTradePaymentRails(env:NodeJS.ProcessEnv){
  const [arc,xlayer]=await Promise.allSettled([hostedArcTradeAvailable(env),hostedTradeAssets(env)])
  return {arc:{enabled:arc.status==='fulfilled'&&arc.value,chainId:5042},xlayer:{enabled:xlayer.status==='fulfilled'&&xlayer.value.enabled,chainId:196}}
}

export async function hostedTradeAssets(env:NodeJS.ProcessEnv){
  if(env.HASHPAYSTREAM_TRADE_HOSTED_ENABLED!=='true')return {enabled:false,assets:[]}
  const apiKey=env.HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY?.trim()
  if(!apiKey||!/^hpl_app_[a-f0-9]{64}$/.test(apiKey))fail(503,'Hosted Trade is not configured.')
  const response=await fetch(ORIGIN+'/api/v2/xstocks-agreements?purpose=assets&kind=trade',{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey}})
  const data=await response.json().catch(()=>fail(502,'Payment assets could not load.'))
  if(!response.ok||data.ok!==true||typeof data.enabled!=='boolean'||!Array.isArray(data.assets))fail(502,'Payment assets could not load.')
  return {enabled:data.enabled,assets:data.assets}
}
