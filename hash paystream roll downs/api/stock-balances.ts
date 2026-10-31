import type { Request, Response } from 'express'
import { isAddress, getAddress, zeroAddress } from 'viem'
import { verifiedTradeIdentity } from './trade-auth.js'
import { verifyTradePrivyWallet } from './trade-privy-wallet.js'
import { readHostedAccountForUser } from './hosted-account.js'
const defaults = { env: () => process.env, identity: verifiedTradeIdentity, legacyWallet: verifyTradePrivyWallet, account: readHostedAccountForUser, fetcher: fetch }
function fail(status:number,message:string):never {throw Object.assign(Error(message),{status})}
export function createStockBalancesHandler(overrides:Partial<typeof defaults>={}) {
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try {
   if(req.method!=='POST')fail(405,'Use POST.')
   const env=d.env(),user=await d.identity(req,env)
   if(req.body?.userId!==undefined||req.body?.walletAppId!==undefined)fail(400,'Wallet identity must come from your connected account.')
   const path=req.originalUrl?.split('?')[0],operation=path==='/api/hashpaystream/v1/stocks/receive'?'receive':path==='/api/hashpaystream/v1/stocks/open'?'open':'balances'
   const legacy=req.body?.source==='legacy'
   if(req.body?.source!==undefined&&!['legacy','connected'].includes(req.body.source))fail(400,'Unsupported wallet source.')
   if(legacy&&operation==='open')fail(400,'Use the existing wallet recovery flow.')
   const key=env.HASHPAYSTREAM_STOCK_BALANCE_API_KEY||''
   if(!/^hpl_app_[a-f0-9]{64}$/.test(key))fail(503,'Stock balances are not available yet.')
   const account=legacy?undefined:await d.account(user!,env)
   if(!legacy&&!account)return res.status(409).json({ok:false,needsConnection:true,error:'Connect your Hash PayLink account to use your stock wallet.'})
   const old=legacy?await d.legacyWallet(user!,req.body?.wallet,env):undefined
   if(!legacy&&req.body?.wallet!==undefined)fail(409,'Update the app to use your connected stock wallet.')
   const request=old?{wallet:old.address}:{userId:account!.hashPayLinkUserId,walletAppId:account!.walletAppId}
   const response=await d.fetcher('https://app.hashpaylink.com/api/v2/wallets/stocks/'+operation,{method:'POST',redirect:'error',signal:AbortSignal.timeout(40000),headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify(request)})
   const data=await response.json()
   if(!response.ok||data.ok!==true)fail(response.status===409?409:503,response.status===409?'Open your connected Hash PayLink wallet, then try again.':'Stock wallet is temporarily unavailable.')
   if(operation==='open'){
    const s=data.session
    if(!s||!/^wst_[a-f0-9]{64}$/.test(s.id)||s.checkoutPath!=='/wallet/stocks/'+s.id||s.chainId!==196||s.walletAppId!==account!.walletAppId||s.userId!==account!.hashPayLinkUserId||!isAddress(s.wallet)||getAddress(s.wallet)===zeroAddress)fail(502,'Wallet link did not match your connected account.')
    return res.json({ok:true,walletSource:'connected',chainId:196,wallet:s.wallet,checkoutUrl:'https://app.hashpaylink.com'+s.checkoutPath})
   }
   if(data.chainId!==196||typeof data.wallet!=='string'||!isAddress(data.wallet)||getAddress(data.wallet)===zeroAddress)fail(502,'Invalid portfolio response.')
   if(old?data.wallet.toLowerCase()!==old.address.toLowerCase():data.userId!==account!.hashPayLinkUserId||data.walletAppId!==account!.walletAppId)fail(502,'Wallet did not match this account.')
   if(data.receive&&(data.receive.chainId!==196||data.receive.address?.toLowerCase()!==data.wallet.toLowerCase()||data.receive.qrValue!==data.receive.address))fail(502,'Receiving wallet mismatch.')
   const {userId:_user,walletAppId:_app,...publicData}=data
   return res.json({...publicData,walletSource:legacy?'legacy':'connected'})
  }catch(reason){const status=Number((reason as {status?:number}).status)||503;return res.status(status).json({ok:false,error:status===401||status===403?'Sign in with the account that owns this wallet.':status>=500?'Stock wallet is temporarily unavailable. Try again.':(reason as Error).message})}
 }
}
export default createStockBalancesHandler()
