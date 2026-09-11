import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { formatUnits, parseUnits, getAddress, type Hex } from 'viem'
import StockFunderOfferTerms from './StockFunderOfferTerms'
import { useStockPaymentSession, EXPECTED_STOCK_ESCROW } from '../lib/useStockPaymentSession'
import { stockWalletClients, settleStockPayment } from '../lib/stockEarlyPayClient'
import { STOCK_ESCROW_ABI, STOCK_TOKEN_ABI, STOCK_OFFER_TYPES, stockDomain, stockOfferMessage, type StockClientConfig, type StockOfferWire } from '../lib/stockEarlyPayProtocol'
type Prepared={config:StockClientConfig;offerId:Hex;offer:StockOfferWire}
type Desk={config:StockClientConfig;paused:boolean;inventory:string;requests:Array<{id:string;title:string;principal:string;payAt:number}>;offers:Array<{id:Hex;requestId:string;offer:StockOfferWire;published:boolean}>}
function FunderContent(){
 const {api,wallet,userId}=useStockPaymentSession(),[data,setData]=useState<Desk>(),[requestId,setRequestId]=useState(''),[fee,setFee]=useState(''),[risk,setRisk]=useState(false),[deposit,setDeposit]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const guard=useRef(false)
 const [prepared,setPrepared]=useState<Prepared>()
 useEffect(()=>{setPrepared(undefined);setRisk(false)},[requestId,fee])
 const load=useCallback(async()=>setData(await api<Desk>(undefined,{view:'desk'})),[api])
 useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
 const request=data?.requests.find(r=>r.id===requestId)
 async function run(action:()=>Promise<void>){if(guard.current)return;guard.current=true;setBusy(true);setError('');try{await action();await load()}catch(e){setError(e instanceof Error?e.message:'This action could not be verified.')}finally{guard.current=false;setBusy(false)}}
 async function review(){
  if(!data||!request||!/^\d+(?:\.\d{1,2})?$/.test(fee))throw Error('Review the offer terms.')
  const feeBps=Number(parseUnits(fee,2));if(feeBps>data.config.maxFeeBps)throw Error('Fee exceeds the limit.')
  setRisk(false);setPrepared(await api<Prepared>({action:'prepare_offer',requestId,feeBps}))
 }
 async function publish(){
  if(!data||!request||!prepared||!risk)throw Error('Review the offer terms.')
  const feeBps=Number(parseUnits(fee,2))
  if(prepared.offer.expiresAt<=Math.floor(Date.now()/1000))throw Error('This quote expired. Review a fresh offer.')
  const {walletClient,account}=await stockWalletClients(wallet(),data.config,EXPECTED_STOCK_ESCROW)
  if(prepared.config.chainId!==data.config.chainId||getAddress(prepared.config.escrow)!==getAddress(data.config.escrow)||getAddress(prepared.offer.funder)!==account||
    prepared.offer.principal!==request.principal||prepared.offer.payAt!==request.payAt||prepared.offer.feeBps!==feeBps||getAddress(prepared.offer.asset)!==getAddress(data.config.asset))throw Error('The offer changed. Review it again.')
  const signature=await walletClient.signTypedData({domain:stockDomain(data.config.chainId,data.config.escrow),types:STOCK_OFFER_TYPES,primaryType:'StockOffer',message:stockOfferMessage(prepared.offer)})
  await api({action:'publish_offer',offerId:prepared.offerId,signature,acceptedRisk:true})
  setPrepared(undefined);setRisk(false);setMessage('Your signed offer is available to this worker.')
 }
 async function inventory(mode:'depositStock'|'withdrawStock'='depositStock'){
  if(!data||!/^\d+(?:\.\d+)?$/.test(deposit))throw Error('Enter a stock token amount.')
  const units=parseUnits(deposit,data.config.assetDecimals);if(units<=0n)throw Error('Enter a positive token amount.')
  const {walletClient,publicClient,account}=await stockWalletClients(wallet(),data.config,EXPECTED_STOCK_ESCROW)
  const key=`hashpaystream:stock-inventory:${mode}:${userId}:${data.config.chainId}:${data.config.escrow}:${account}`
  const pending=localStorage.getItem(key)
  if(pending){
   if(!/^0x[a-fA-F0-9]{64}$/.test(pending))throw Error('A previous deposit submission needs wallet verification.')
   const receipt=await publicClient.waitForTransactionReceipt({hash:pending as Hex,confirmations:data.config.confirmations,timeout:60_000})
   localStorage.removeItem(key);if(receipt.status!=='success')throw Error('The previous deposit reverted. You can try again.')
   setMessage('Previous deposit confirmed.');return
  }
  const allowance=await publicClient.readContract({address:data.config.asset,abi:STOCK_TOKEN_ABI,functionName:'allowance',args:[account,data.config.escrow]})
  if(mode==='depositStock'&&allowance<units){
   const tx=await walletClient.writeContract({address:data.config.asset,abi:STOCK_TOKEN_ABI,functionName:'approve',args:[data.config.escrow,units]})
   const receipt=await publicClient.waitForTransactionReceipt({hash:tx,confirmations:data.config.confirmations,timeout:60_000});if(receipt.status!=='success')throw Error('Token approval failed.')
  }
  const simulation=await publicClient.simulateContract({account,address:data.config.escrow,abi:STOCK_ESCROW_ABI,functionName:mode,args:[data.config.asset,units]})
  localStorage.setItem(key,'submitting')
  try{
   const tx=await walletClient.writeContract(simulation.request);localStorage.setItem(key,tx)
   const receipt=await publicClient.waitForTransactionReceipt({hash:tx,confirmations:data.config.confirmations,timeout:60_000})
   localStorage.removeItem(key);if(receipt.status!=='success')throw Error('The deposit reverted.')
   setMessage(mode==='depositStock'?'Stock inventory confirmed.':'Unused stock withdrawal confirmed.')
  }catch(e){if((e as {code?:number}).code===4001)localStorage.removeItem(key);throw e}
 }
 async function settle(id:Hex){
  if(!data)return
  const w=wallet()
  await settleStockPayment({api,wallet:w,config:data.config,expectedEscrow:EXPECTED_STOCK_ESCROW,offerId:id,storage:localStorage,
   storageKey:'hashpaystream:stock-settlement:'+userId+':'+data.config.chainId+':'+data.config.escrow.toLowerCase()+':'+w.address.toLowerCase()+':'+id})
  setMessage('Repayment confirmed on chain.')
 }
 return <section className="stream-screen w-full max-w-md space-y-4 py-5 sm:py-8"><h1 className="text-xl font-black">Funding</h1><p className="text-[11px] text-gray-500">Stock-payment test pilot</p>
 {data&&<><div className="stream-card space-y-3 p-4"><p className="text-xs">Available: {formatUnits(BigInt(data.inventory),data.config.assetDecimals)} {data.config.assetSymbol}</p><input aria-label="Stock token amount" inputMode="decimal" value={deposit} onChange={e=>setDeposit(e.target.value)} className="w-full rounded-xl border p-3 text-xs dark:bg-zinc-900"/><button type="button" disabled={busy} onClick={()=>void run(()=>inventory())} className="text-xs font-bold">Deposit / check pending deposit</button><button type="button" disabled={busy} onClick={()=>void run(()=>inventory('withdrawStock'))} className="ml-3 text-xs font-bold">Withdraw / check withdrawal</button></div>
 <div className="stream-card space-y-3 p-4"><select aria-label="Eligible earnings request" value={requestId} disabled={busy||data.paused} onChange={e=>{setRequestId(e.target.value);setRisk(false)}} className="w-full rounded-xl border p-3 text-xs dark:bg-zinc-900"><option value="">Choose eligible earnings</option>{data.requests.map(r=><option key={r.id} value={r.id}>{r.title} · {formatUnits(BigInt(r.principal),6)} USDC</option>)}</select>
 <StockFunderOfferTerms feePercent={fee} maxFeeBps={data.config.maxFeeBps} acceptedRisk={risk} onFeeChange={setFee} onRiskChange={setRisk} disabled={busy||data.paused}/>
 <button type="button" disabled={busy||data.paused||!request} onClick={()=>void run(review)} className="text-xs font-bold">Review current quote</button>
 {prepared&&<p className="text-xs">You send {formatUnits(BigInt(prepared.offer.tokenAmount),data.config.assetDecimals)} {data.config.assetSymbol}. You receive {formatUnits(BigInt(prepared.offer.principal)+BigInt(prepared.offer.principal)*BigInt(prepared.offer.feeBps)/10000n,6)} USDC on {new Date(prepared.offer.payAt*1000).toLocaleDateString()}. Quote expires {new Date(prepared.offer.expiresAt*1000).toLocaleTimeString()}.</p>}
 <button type="button" disabled={busy||data.paused||!request||!risk||!prepared} onClick={()=>void run(publish)} className="w-full rounded-full bg-emerald-500 p-3 text-xs font-black text-emerald-950 disabled:opacity-40">Publish offer</button></div>
 {data.offers.filter(o=>o.published).map(o=><div className="stream-card p-4 text-xs" key={o.id}><p>{formatUnits(BigInt(o.offer.principal),6)} USDC · {o.offer.feeBps/100}% fee</p><button type="button" disabled={busy} onClick={()=>void run(()=>settle(o.id))} className="mt-2 font-bold">Check / claim repayment</button></div>)}</>}
 {message&&<p role="status" className="text-xs text-gray-500">{message}</p>}{error&&<p role="alert" className="text-xs text-rose-600">{error}</p>}
 <button type="button" disabled={busy} onClick={()=>void run(load)} className="text-xs font-bold">Refresh</button></section>
}
export default function StockFunderDesk(){const {user}=usePrivy();return <FunderContent key={user?.id??'signed-out'}/>}
