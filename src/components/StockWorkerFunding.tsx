import StockEmployerFunding from './StockEmployerFunding'
import { performStockEarnings, stockEarningsPendingKey, type EarningsView } from '../lib/stockEarningsClient'
import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { formatUnits, parseUnits, type Hex } from 'viem'
import FundingPartnerPicker from './FundingPartnerPicker'
import { ProviderPayoutWallet } from './ProviderPayoutWallet'
import { useStockPaymentSession, EXPECTED_STOCK_ESCROW } from '../lib/useStockPaymentSession'
import { confirmStockPayment, recoverStockPayment, stockPendingKey } from '../lib/stockEarlyPayClient'
import type { StockClientConfig } from '../lib/stockEarlyPayProtocol'
import type { StockOffer, StockEligibilityContext } from '../lib/stockFundingOffers'
import StockMarketStatus, { type StockMarketStatusValue } from './StockMarketStatus'
type RequestInfo={id:string;principal:string}
type Earnings=EarningsView&{request:RequestInfo|null}
type Offers={config:StockClientConfig;offers:StockOffer[];contexts:Record<string,StockEligibilityContext>;verifiedCompletedFundingCounts:Record<string,number>;positions:Array<{id:Hex;repayment:string;settled:boolean}>}
function WorkerContent(){
 const {api,wallet,userId}=useStockPaymentSession()
 const [walletAddress,setWalletAddress]=useState(''),[employerOpen,setEmployerOpen]=useState(false),[config,setConfig]=useState<StockClientConfig>()
 const [earnings,setEarnings]=useState<Earnings[]>([]),[selected,setSelected]=useState(''),[amount,setAmount]=useState(''),[offers,setOffers]=useState<Offers>(),[request,setRequest]=useState<RequestInfo>(),[marketStatus,setMarketStatus]=useState<StockMarketStatusValue>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(false)
 const load=useCallback(async()=>{const [data,status]=await Promise.all([api<{earnings:Earnings[];config:StockClientConfig}>(undefined,{view:'worker'}),api<{marketStatus:StockMarketStatusValue}>(undefined,{view:'market_status'}).catch(()=>undefined)]);setEarnings(data.earnings);setConfig(data.config);setMarketStatus(status?.marketStatus)},[api])
 useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
 const refresh=useCallback(async()=>{if(!request)return;setOffers(await api<Offers>(undefined,{view:'offers',requestId:request.id}))},[api,request])
 useEffect(()=>{void refresh().catch(e=>setError(e.message));if(!request)return;const timer=window.setInterval(()=>void refresh().catch(()=>{}),15000);return()=>window.clearInterval(timer)},[refresh,request])
 useEffect(()=>{if(!offers)return;try{setPending(Boolean(localStorage.getItem(stockPendingKey(userId,offers.config,wallet().address))))}catch{/* wallet may still connect */}},[offers,userId,wallet])
 async function find(){
  if(busy)return
  setBusy(true);setError('')
  try{
   const e=earnings.find(e=>e.id===selected);if(!e)throw Error('Choose approved earnings.')
   if(e.request){setOffers(undefined);setRequest(e.request);return}
   const principal=parseUnits(amount,6).toString()
   const data=await api<{request:RequestInfo}>({action:'request_stock',earningsId:e.id,principal})
   setOffers(undefined);setRequest(data.request)
  }catch(e){setError(e instanceof Error?e.message:'Your request could not be created.')}finally{setBusy(false)}
 }
 return <section className="stream-screen w-full max-w-md space-y-4 py-5 sm:py-8">
  <h1 className="text-xl font-black">Get paid early</h1><p className="text-[11px] text-gray-500">Stock-payment test pilot. Only approved earnings funded on this network are eligible.</p>
  <StockMarketStatus value={marketStatus}/>
  <ProviderPayoutWallet value={walletAddress} onChange={setWalletAddress} />
  <details className="stream-card p-4" onToggle={e=>setEmployerOpen(e.currentTarget.open)}><summary className="cursor-pointer text-xs font-bold">Fund worker earnings</summary>{employerOpen&&<StockEmployerFunding/>}</details>
  {!request&&<div className="stream-card space-y-3 p-4">
   <label className="block text-xs font-bold">Approved earnings<select className="mt-2 w-full rounded-xl border p-3 text-xs dark:bg-zinc-900" value={selected} onChange={e=>{const previous=earnings.find(item=>item.id===e.target.value)?.request;setSelected(e.target.value);setAmount(previous?formatUnits(BigInt(previous.principal),6):'');setError('')}}><option value="">Choose earnings</option>{earnings.filter(e=>e.approved&&BigInt(e.available)>0n).map(e=><option key={e.id} value={e.id}>{e.title} · {formatUnits(BigInt(e.available),6)} USDC</option>)}</select></label>
   <label className="block text-xs font-bold">Amount in USDC<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-2 w-full rounded-xl border p-3 dark:bg-zinc-900"/></label>
   <button type="button" disabled={busy||!selected||!/^\d+(?:\.\d{1,6})?$/.test(amount)} onClick={()=>void find()} className="w-full rounded-full bg-emerald-500 p-3 text-xs font-black text-emerald-950 disabled:opacity-40">{busy?'Checking offers...':'See eligible offers'}</button>
  </div>}
  {request&&offers&&offers.positions.length>0?<div className="stream-card p-4 text-xs"><p className="font-bold">{offers.positions.every(p=>p.settled)?'Funder repayment recorded':'Stock payment recorded'}</p><p className="mt-2 text-gray-500">Your fixed repayment follows the accepted terms.</p></div>:request&&offers&&!pending?<FundingPartnerPicker requestId={request.id} stock={{...offers,onRefresh:refresh,onConfirm:async offer=>{
   const w=wallet(),key=stockPendingKey(userId,offers.config,w.address)
   try{await confirmStockPayment({api,wallet:w,config:offers.config,expectedEscrow:EXPECTED_STOCK_ESCROW,offer,storage:localStorage,storageKey:key})}
   finally{setPending(Boolean(localStorage.getItem(key)));await refresh()}
  }}}/>:null}
  {request&&!offers&&<p className="text-xs text-gray-500">Loading eligible offers...</p>}
  {pending&&<button type="button" disabled={busy} className="stream-card w-full p-4 text-xs font-bold" onClick={async()=>{setBusy(true);try{if(!offers)return;await recoverStockPayment(api,localStorage,stockPendingKey(userId,offers.config,wallet().address));setPending(false);await refresh()}catch(e){setError(e instanceof Error?e.message:'Payment is not verified yet.')}finally{setBusy(false)}}}>Check pending stock payment</button>}
  {config&&earnings.filter(e=>e.approved&&BigInt(e.available)>0n&&e.payAt<=Math.floor(Date.now()/1000)).map(e=><button key={e.id} type="button" disabled={busy} className="stream-card w-full p-4 text-xs font-bold" onClick={async()=>{setBusy(true);setError('');try{const w=wallet();await performStockEarnings({api,wallet:w,config,expectedEscrow:EXPECTED_STOCK_ESCROW,operation:'releaseEarnings',earningsId:e.id,earnings:e,storage:localStorage,storageKey:stockEarningsPendingKey(userId,config,w.address)});await load()}catch(error){setError(error instanceof Error?error.message:'Payment could not be verified.')}finally{setBusy(false)}}}>Receive remaining earnings: {formatUnits(BigInt(e.available),6)} USDC</button>)}
  {error&&<div role="alert" className="text-xs text-rose-600">{error}<button type="button" onClick={()=>{setError('');void (request?refresh():load()).catch(e=>setError(e.message))}} className="ml-2 underline">Try again</button></div>}
 </section>
}
export default function StockWorkerFunding(){const {user}=usePrivy();return <WorkerContent key={user?.id??'signed-out'}/>}
