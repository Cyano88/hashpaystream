import {useEffect,useRef,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import {ArrowLeftIcon,ChevronRightIcon,CurrencyDollarIcon,ChartBarIcon} from '@heroicons/react/24/outline'
import {Link} from '../lib/router'
import {useStreamPayPath} from '../lib/useStreamPayPath'
import {fetchWithTimeout} from '../lib/fetchWithTimeout'
import HostedAccountConnection from './HostedAccountConnection'
import {AgreementSignInLanding} from './agreements/AgreementSignInLanding'
export default function StreamPaySwap(){
 const {authenticated,user}=usePrivy()
 return authenticated?<SwapOptions key={user?.id}/>:<AgreementSignInLanding/>
}
function SwapOptions(){
 const {getAccessToken}=usePrivy(),home=useStreamPayPath('/home')
 const [rail,setRail]=useState<'arc'|'xlayer'>(),[busy,setBusy]=useState(false),[url,setUrl]=useState(''),[connect,setConnect]=useState(false),[error,setError]=useState('')
 const active=useRef(true),locked=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function open(network:'arc'|'xlayer'){
  if(locked.current)return;locked.current=true;setBusy(true);setRail(network);setError('');setUrl('');setConnect(false)
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
   const token=await Promise.race([getAccessToken(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Your session took too long. Try again.')),15000)})]).finally(()=>clearTimeout(timer))
   if(!active.current)return;if(!token)throw Error('Sign in again to swap.')
   const response=await fetchWithTimeout('/api/hashpaystream/v1/wallet/swap',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({rail:network})})
   const data=await response.json();if(!active.current)return
   if(!response.ok||!data.ok)throw Error(data.error||'Swap could not open.')
   if(data.needsConnection){setConnect(true);return}
   if(!/^https:\/\/app\.hashpaylink\.com\/wallet\/swap\/wss_[a-f0-9]{64}$/.test(data.checkoutUrl)||data.rail!==network)throw Error('The swap link did not match your selected wallet.')
   setUrl(data.checkoutUrl)
  }catch(e){if(active.current)setError((e as Error).message)}finally{locked.current=false;if(active.current)setBusy(false)}
 }
 return <section className='stream-screen w-full max-w-md py-5 sm:py-8'>
  <header className='grid grid-cols-[44px_1fr_44px] items-center'><Link to={home} className='stream-icon-button' aria-label='Back home'><ArrowLeftIcon className='h-4 w-4'/></Link><h1 className='text-center text-lg font-extrabold'>Swap</h1></header>
  <div className='mt-5 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.07] dark:bg-white/[0.035]'>
   {([{rail:'arc',title:'USDC',detail:'Swap on Arc',Icon:CurrencyDollarIcon},{rail:'xlayer',title:'xStocks',detail:'Swap on X Layer',Icon:ChartBarIcon}] as const).map(item=><button key={item.rail} type='button' disabled={busy} onClick={()=>void open(item.rail)} className='flex min-h-20 w-full items-center gap-3 border-b border-gray-100 px-4 text-left last:border-b-0 disabled:opacity-50 dark:border-white/[0.07]'><item.Icon className='h-5 w-5 text-gray-500' strokeWidth={1.6}/><span className='flex-1'><span className='block text-sm font-bold'>{item.title}</span><span className='mt-1 block text-xs text-gray-400'>{item.detail}</span></span><ChevronRightIcon className='h-4 w-4 text-gray-400'/></button>)}
  </div>
  {busy&&<div role='status' aria-label='Opening swap' className='mt-4 h-11 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5'/>}
  {connect&&<div className='mt-4'><HostedAccountConnection/><button disabled={busy} className='min-h-11 w-full text-xs font-bold' onClick={()=>rail&&void open(rail)}>Continue after connecting</button></div>}
  {url&&<div className='mt-4'><p className='mb-3 text-xs text-gray-500'>Review your swap using your linked Hash PayLink wallet.</p><a href={url} target='_blank' rel='noreferrer' className='flex min-h-11 items-center justify-center rounded-full bg-gray-950 px-4 text-sm font-bold text-white dark:bg-white dark:text-gray-950'>Open {rail==='arc'?'Arc':'xStocks'} swap</a></div>}
  {error&&<div role='alert' className='mt-4 text-xs text-red-600'>{error}<button className='block min-h-11 underline' onClick={()=>rail&&void open(rail)}>Try again</button></div>}
 </section>
}
