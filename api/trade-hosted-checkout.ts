const ORIGIN='https://app.hashpaylink.com'
function fail(status:number,message:string):never{throw Object.assign(Error(message),{status})}
export type HostedTradeReservation={kind:'hosted-trade-v1';walletAppId:string;idempotencyKey:string;request:{kind:'trade';amount:string;paymentToken:string;trade:{offerId:string;snapshotHash:string};[key:string]:unknown}}
export async function hostedTradeCheckout(reservation:HostedTradeReservation,env:NodeJS.ProcessEnv){
  const apiKey=env.HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY?.trim()
  if(!apiKey||!/^hpl_app_[a-f0-9]{64}$/.test(apiKey))fail(503,'Hosted Trade is not configured.')
  const call=async(method:string,path:string,body?:unknown)=>{
    const response=await fetch(ORIGIN+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey!,'content-type':'application/json','idempotency-key':reservation.idempotencyKey},...(body?{body:JSON.stringify(body)}:{})})
    const data=await response.json().catch(()=>fail(502,'Checkout service is unavailable. Try again.'))
    return {response,data}
  }
  let result=await call('GET','/api/v2/xstocks-agreements?idempotencyKey='+encodeURIComponent(reservation.idempotencyKey))
  if(result.response.status===404)result=await call('POST','/api/v2/xstocks-agreements',reservation.request)
  const {response,data}=result
  if(!response.ok||data.ok!==true)fail(response.status===409?409:502,response.status===409?'New stock checkout is currently paused. Existing escrow recovery remains available.':'Could not open hosted checkout. Try again.')
  const agreement=data.agreement
  if(!agreement||!/^xag_[a-f0-9]{64}$/.test(agreement.id)||agreement.walletAppId!==reservation.walletAppId||agreement.checkoutPath!=='/agreements/xstocks/'+agreement.id
    ||agreement.terms?.kind!=='trade'||agreement.terms.trade?.offerId!==reservation.request.trade.offerId||agreement.terms.trade?.snapshotHash!==reservation.request.trade.snapshotHash
    ||agreement.terms.amount!==reservation.request.amount||agreement.terms.xlayerPayment?.token?.toLowerCase()!==reservation.request.paymentToken.toLowerCase())fail(502,'The checkout does not match the accepted Trade.')
  return {checkoutUrl:ORIGIN+agreement.checkoutPath,state:agreement.observed?.state,observedBlock:agreement.observed?.observedBlock}
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
