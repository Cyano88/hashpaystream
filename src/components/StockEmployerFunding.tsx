import { useCallback, useEffect, useRef, useState } from 'react'
import { formatUnits, parseUnits, isAddress, toHex, type Hex } from 'viem'
import { useStockPaymentSession, EXPECTED_STOCK_ESCROW } from '../lib/useStockPaymentSession'
import { performStockEarnings, recoverStockEarnings, stockEarningsPendingKey, type EarningsView } from '../lib/stockEarningsClient'
import type { StockClientConfig, StockFundingDraft, StockEarningsAction } from '../lib/stockEarlyPayProtocol'

type EmployerView={config:StockClientConfig;paused:boolean;now:number;earnings:EarningsView[];drafts:StockFundingDraft[]}
const newSalt=()=>toHex(crypto.getRandomValues(new Uint8Array(32)))
export default function StockEmployerFunding(){
 const {api,wallet,userId}=useStockPaymentSession()
 const [data,setData]=useState<EmployerView>(),[title,setTitle]=useState(''),[worker,setWorker]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState('')
 const [salt,setSalt]=useState(newSalt),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[consent,setConsent]=useState('')
 const guard=useRef(false)
 const load=useCallback(async()=>setData(await api<EmployerView>(undefined,{view:'employer'})),[api])
 useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
 async function run(action:()=>Promise<void>){
  if(guard.current)return;guard.current=true;setBusy(true);setError('');setMessage('')
  try{await action();await load()}catch(error){setError(error instanceof Error?error.message:'This action could not be confirmed.')}
  finally{guard.current=false;setBusy(false)}
 }
 function change(set:(value:string)=>void,value:string){set(value);setSalt(newSalt())}
 async function review(){
  if(!/^\d+(?:\.\d{1,6})?$/.test(amount)||!isAddress(worker)||!title.trim())throw Error('Enter the title, worker wallet, amount and payment date.')
  const payAt=Math.floor(new Date(date).getTime()/1000)
  if(!Number.isSafeInteger(payAt)||payAt<=Math.floor(Date.now()/1000))throw Error('Choose a future payment date.')
  await api({action:'prepare_funding',salt,title,worker,amount:parseUnits(amount,6).toString(),payAt})
  setMessage('Review the saved funding details below. No money has moved.')
 }
 const terms=(e:EarningsView)=>JSON.stringify([e.id,e.worker,e.available,e.payAt])
 async function act(operation:StockEarningsAction,id:Hex,draft?:StockFundingDraft,earnings?:EarningsView){
  if(!data)return
  const w=wallet()
  await performStockEarnings({api,wallet:w,config:data.config,expectedEscrow:EXPECTED_STOCK_ESCROW,operation,earningsId:id,draft,earnings,
   acceptedIrrevocable:earnings?consent===terms(earnings):false,storage:localStorage,storageKey:stockEarningsPendingKey(userId,data.config,w.address)})
  setConsent('');setMessage('Transaction confirmed.')
 }
 return <div className="space-y-4 pt-4">
  <p className="text-xs text-gray-500">Fund approved work in USDC. Funding and final approval are separate steps.</p>
  <div className="space-y-3">
   <label className="block text-xs font-bold">Earnings title<input value={title} disabled={busy} onChange={e=>change(setTitle,e.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:bg-zinc-900"/></label>
   <label className="block text-xs font-bold">Worker wallet<input value={worker} disabled={busy} onChange={e=>change(setWorker,e.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:bg-zinc-900"/></label>
   <label className="block text-xs font-bold">Amount in USDC<input inputMode="decimal" value={amount} disabled={busy} onChange={e=>change(setAmount,e.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:bg-zinc-900"/></label>
   <label className="block text-xs font-bold">Payment date and time<input type="datetime-local" value={date} disabled={busy} onChange={e=>change(setDate,e.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:bg-zinc-900"/></label>
   <button type="button" disabled={busy||!data||data.paused} onClick={()=>void run(review)} className="w-full rounded-full bg-emerald-500 p-3 text-xs font-black text-emerald-950 disabled:opacity-40">Review funding</button>
  </div>
  {data?.drafts.map(draft=><div className="rounded-xl border p-3 text-xs dark:border-white/10" key={draft.id}>
   <p className="font-bold">{draft.title}</p><p className="mt-2 break-all">Worker: {draft.worker}</p>
   <p>{formatUnits(BigInt(draft.amount),6)} USDC · {new Date(draft.payAt*1000).toLocaleString()}</p>
   <p className="mt-2 text-gray-500">This deposits USDC into escrow. You can return it before final approval.</p>
   <button type="button" disabled={busy||data.paused||draft.payAt<=data.now} onClick={()=>void run(()=>act('fundEarnings',draft.id,draft))} className="mt-3 font-bold">Fund these earnings</button>
   <button type="button" disabled={busy} onClick={()=>void run(async()=>{const result=await api<{status:string}>({action:'earnings_status',operation:'fundEarnings',earningsId:draft.id});setMessage(result.status==='confirmed'?'Funding confirmed.':'Funding is not confirmed yet.')})} className="ml-4 font-bold">Check funding</button>
  </div>)}
  {data?.earnings.map(e=><div className="rounded-xl border p-3 text-xs dark:border-white/10" key={e.id}>
   <p className="font-bold">{e.title}</p><p className="mt-2 break-all">Worker: {e.worker}</p>
   <p>{formatUnits(BigInt(e.available),6)} USDC remaining · {new Date(e.payAt*1000).toLocaleString()}</p>
   {!e.approved&&BigInt(e.available)>0n&&<>
    <label className="mt-3 flex items-start gap-2 leading-5"><input type="checkbox" checked={consent===terms(e)} disabled={busy} onChange={event=>setConsent(event.target.checked?terms(e):'')}/>I confirm this work is earned. After approval, this money belongs to the worker and I cannot cancel or take it back.</label>
    <button type="button" disabled={busy||data.paused||e.payAt<=data.now||consent!==terms(e)} onClick={()=>void run(()=>act('approveEarnings',e.id,undefined,e))} className="mt-3 font-bold disabled:opacity-40">Approve earned payment</button>
    <button type="button" disabled={busy} onClick={()=>void run(()=>act('cancelUnapprovedEarnings',e.id,undefined,e))} className="ml-4 font-bold">Return unapproved funds</button>
   </>}
   {e.approved&&<p className="mt-2 text-gray-500">Approved. These earnings cannot be cancelled.</p>}
   {e.approved&&BigInt(e.available)>0n&&e.payAt<=data.now&&<button type="button" disabled={busy} onClick={()=>void run(()=>act('releaseEarnings',e.id,undefined,e))} className="mt-3 font-bold">Pay remaining earnings to worker</button>}
  </div>)}
  {data&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{await recoverStockEarnings(api,localStorage,stockEarningsPendingKey(userId,data.config,wallet().address));setMessage('Pending action checked.')})} className="text-xs font-bold">Check pending action</button>}
  <button type="button" disabled={busy} onClick={()=>void run(load)} className="ml-4 text-xs font-bold">Refresh</button>
  {message&&<p role="status" className="text-xs text-gray-500">{message}</p>}
  {error&&<p role="alert" className="text-xs text-rose-600">{error}</p>}
 </div>
}
