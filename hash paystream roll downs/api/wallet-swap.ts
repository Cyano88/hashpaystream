import type {Request,Response} from 'express'
import {verifiedTradeIdentity} from './trade-auth.js'
import {readHostedAccountForUser} from './hosted-account.js'
function fail(status:number,message:string):never{throw Object.assign(Error(message),{status})}
const defaults={env:()=>process.env,identity:verifiedTradeIdentity,account:readHostedAccountForUser,fetcher:fetch}
export function createWalletSwapHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(req.method!=='POST')fail(405,'Use POST.')
   const user=await d.identity(req,d.env()),rail=req.body?.rail
   if(!['arc','xlayer'].includes(rail))fail(400,'Choose Arc or X Layer.')
   const key=d.env().HASHPAYSTREAM_WALLET_SWAP_API_KEY||''
   if(!/^hpl_app_[a-f0-9]{64}$/.test(key))fail(503,'Swap is awaiting wallet service activation.')
   const account=await d.account(user!,d.env())
   if(!account)return res.json({ok:true,needsConnection:true})
   const response=await d.fetcher('https://app.hashpaylink.com/api/v2/wallets/swap-sessions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json','x-api-key':key,'idempotency-key':account.subject+':swap:'+rail},body:JSON.stringify({rail,userId:account.hashPayLinkUserId})})
   const data=await response.json().catch(()=>fail(502,'Swap service could not load.'))
   if(!response.ok||!data.ok)fail(response.status===409?409:502,response.status===409?'Swap is not enabled for this account yet.':'Swap service could not load. Try again.')
   const session=data.session
   if(!session||!/^wss_[a-f0-9]{64}$/.test(session.id)||session.checkoutPath!=='/wallet/swap/'+session.id||session.walletAppId!==account.walletAppId||session.rail!==rail||session.chainId!==(rail==='arc'?5042:196))fail(502,'The swap link does not match your wallet.')
   return res.json({ok:true,checkoutUrl:'https://app.hashpaylink.com'+session.checkoutPath,rail,chainId:session.chainId})
  }catch(error){const status=Number((error as {status?:number}).status)||503;return res.status(status).json({ok:false,error:status>=500?'Swap is not available yet. Please try again shortly.':(error as Error).message})}
 }
}
export default createWalletSwapHandler()
