import { encodeFunctionData, getAddress, type Hex } from 'viem'
import { STOCK_ESCROW_ABI, STOCK_TOKEN_ABI, stockEarningsId, type StockClientConfig, type StockFundingDraft, type StockEarningsAction } from './stockEarlyPayProtocol'
import { stockWalletClients, type StockApiCall, type StockBrowserWallet } from './stockEarlyPayClient'

export type EarningsView = { id:Hex; employer:string; worker:string; available:string; payAt:number; approved:boolean; title:string }
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>
type Pending={operation:StockEarningsAction;earningsId:Hex;txHash?:Hex}
export const stockEarningsPendingKey=(userId:string,c:StockClientConfig,wallet:string)=>
 'hashpaystream:stock-earnings:v1:'+userId+':'+c.chainId+':'+c.escrow.toLowerCase()+':'+wallet.toLowerCase()
export function walletRejected(error:unknown):boolean {
 let current=error
 for(let i=0;i<8&&current&&typeof current==='object';i++){
  if((current as {code?:number}).code===4001)return true
  current=(current as {cause?:unknown}).cause
 }
 return false
}
export async function recoverStockEarnings(api:StockApiCall,storage:StoragePort,key:string) {
 const raw=storage.getItem(key);if(!raw)return
 const pending=JSON.parse(raw) as Pending
 const result=await api<{status:string}>({action:'earnings_status',...pending})
 if(result.status==='pending')throw Error('This transaction is not confirmed yet. Check wallet activity before trying again.')
 if(result.status!=='confirmed'&&result.status!=='reverted')throw Error('Transaction status could not be verified.')
 storage.removeItem(key)
 if(result.status==='reverted')throw Error('The transaction reverted. No change was made by that transaction; you can retry.')
}
async function perform(input:{
 api:StockApiCall;wallet:StockBrowserWallet;config:StockClientConfig;expectedEscrow:string;
 operation:StockEarningsAction;earningsId:Hex;draft?:StockFundingDraft;earnings?:EarningsView;
 acceptedIrrevocable?:boolean;storage:StoragePort;storageKey:string
}) {
 const {api,wallet,config,operation,earningsId,storage,storageKey}=input
 if(storage.getItem(storageKey)){await recoverStockEarnings(api,storage,storageKey);return}
 if(operation==='approveEarnings'&&input.acceptedIrrevocable!==true)throw Error('Confirm that these earnings permanently belong to the worker.')
 const prepared=await api<{config:StockClientConfig;data:Hex;draft?:StockFundingDraft;earnings?:EarningsView}>({
  action:'earnings_action',earningsId,operation,acceptedIrrevocable:input.acceptedIrrevocable===true
 })
 if(prepared.config.chainId!==config.chainId||getAddress(prepared.config.escrow)!==getAddress(config.escrow)||getAddress(prepared.config.usdc)!==getAddress(config.usdc))throw Error('Deployment changed. Refresh and review again.')
 const {publicClient,walletClient,account}=await stockWalletClients(wallet,config,input.expectedEscrow)
 let expected:Hex
 if(operation==='fundEarnings'){
  const draft=input.draft
  if(!draft||!prepared.draft||draft.id!==earningsId||stockEarningsId(account,draft.salt)!==earningsId||getAddress(draft.employer)!==account||
   ['salt','worker','amount','payAt','employer','title'].some(field=>draft[field as keyof StockFundingDraft]!==prepared.draft![field as keyof StockFundingDraft]))throw Error('Funding terms changed. Review them again.')
  expected=encodeFunctionData({abi:STOCK_ESCROW_ABI,functionName:'fundEarnings',args:[draft.salt,draft.worker,BigInt(draft.amount),draft.payAt]})
 }else{
  const shown=input.earnings,current=prepared.earnings
  if(!shown||!current||shown.id!==earningsId||shown.worker.toLowerCase()!==current.worker.toLowerCase()||shown.available!==current.available||shown.payAt!==current.payAt||shown.approved!==current.approved)throw Error('Earnings changed. Refresh and review them again.')
  expected=encodeFunctionData({abi:STOCK_ESCROW_ABI,functionName:operation,args:[earningsId]})
 }
 if(prepared.data.toLowerCase()!==expected.toLowerCase())throw Error('Transaction does not match the reviewed terms.')
 if(operation==='fundEarnings'){
  const amount=BigInt(input.draft!.amount)
  const allowance=await publicClient.readContract({address:config.usdc,abi:STOCK_TOKEN_ABI,functionName:'allowance',args:[account,config.escrow]})
  if(allowance<amount){
   const hash=await walletClient.writeContract({address:config.usdc,abi:STOCK_TOKEN_ABI,functionName:'approve',args:[config.escrow,amount]})
   const receipt=await publicClient.waitForTransactionReceipt({hash,confirmations:config.confirmations,timeout:60_000})
   if(receipt.status!=='success')throw Error('USDC approval reverted.')
  }
 }
 await publicClient.call({account,to:config.escrow,data:expected})
 const pending:Pending={operation,earningsId}
 storage.setItem(storageKey,JSON.stringify(pending))
 try{
  const txHash=await walletClient.sendTransaction({to:config.escrow,data:expected})
  storage.setItem(storageKey,JSON.stringify({...pending,txHash}))
  await publicClient.waitForTransactionReceipt({hash:txHash,confirmations:config.confirmations,timeout:60_000})
  await recoverStockEarnings(api,storage,storageKey)
 }catch(error){if(walletRejected(error))storage.removeItem(storageKey);throw error}
}

const inFlight=new Set<string>()
export async function performStockEarnings(input:Parameters<typeof perform>[0]) {
 if(inFlight.has(input.storageKey))throw Error('An earnings action is already being checked.')
 inFlight.add(input.storageKey)
 try{return await perform(input)}finally{inFlight.delete(input.storageKey)}
}
