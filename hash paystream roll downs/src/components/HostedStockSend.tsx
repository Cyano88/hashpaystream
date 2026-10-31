import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import HostedAccountConnection from './HostedAccountConnection'
export default function HostedStockSend({asset = 'NVDAx'}:{asset?:string}) {
 const {getAccessToken}=usePrivy(),[url,setUrl]=useState(''),[error,setError]=useState(''),[connect,setConnect]=useState(false),[revision,setRevision]=useState(0)
 useEffect(()=>{let cancelled=false;const controller=new AbortController();setUrl('');setError('');setConnect(false)
 const timeout=setTimeout(()=>{controller.abort();if(!cancelled)setError('Wallet took too long to open. Try again.')},45000)
 void(async()=>{const token=await getAccessToken();if(cancelled||controller.signal.aborted)return;if(!token)throw Error('Sign in again to continue.')
 const r=await fetchWithTimeout('/api/hashpaystream/v1/stocks/open',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({source:'connected'})},40000)
 const data=await r.json();if(cancelled)return;if(data.needsConnection){setConnect(true);return}
 if(!r.ok||!data.ok)throw Error(data.error||'Stock wallet could not open.')
 if(!/^https:\/\/app\.hashpaylink\.com\/wallet\/stocks\/wst_[a-f0-9]{64}$/.test(data.checkoutUrl)||data.chainId!==196||data.walletSource!=='connected')throw Error('Wallet link did not match this account.')
 setUrl(data.checkoutUrl+(asset?'?asset='+encodeURIComponent(asset):''))
 })().catch(e=>{if(!cancelled&&!controller.signal.aborted)setError(e.message)}).finally(()=>clearTimeout(timeout))
 return()=>{cancelled=true;controller.abort();clearTimeout(timeout)}
 },[getAccessToken,revision,asset])
 return <div className="mt-5">{connect?<><HostedAccountConnection/><button className="min-h-11 text-xs underline" onClick={()=>setRevision(n=>n+1)}>Continue after connecting</button></>:url?<div className="stream-card p-5"><p className="mb-4 text-xs leading-5 text-gray-500">Send from the same Hash PayLink wallet you use for Trade and Swap. Review the recipient and amount before approving.</p><a className="flex min-h-12 items-center justify-center rounded-full bg-gray-950 px-5 text-sm font-bold text-white dark:bg-white dark:text-gray-950" href={url} target="_blank" rel="noreferrer">Open stock wallet</a></div>:error?<div role="alert" className="text-xs text-red-600">{error}<button className="block min-h-11 underline" onClick={()=>setRevision(n=>n+1)}>Try again</button></div>:<div role="status" aria-label="Opening stock wallet" className="h-28 animate-pulse rounded-2xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5"/>}</div>
}
