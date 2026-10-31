import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, ChevronRightIcon, ChartBarIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import StreamPaySend from './StreamPaySend'
import HostedStockSend from './HostedStockSend'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
export default function StreamPaySendOptions(){const {authenticated,user}=usePrivy();return authenticated?<Options key={user?.id}/>:<AgreementSignInLanding/>}
function Options(){
 const [rail,setRail]=useState<'arc'|'xlayer'>(),home=useStreamPayPath('/home')
 if(rail==='arc')return <StreamPaySend onBack={()=>setRail(undefined)}/>
 return <section className="stream-screen w-full max-w-md py-5 sm:py-8"><header className="grid grid-cols-[44px_1fr_44px] items-center">{rail?<button className="stream-icon-button" aria-label="Back to send options" onClick={()=>setRail(undefined)}><ArrowLeftIcon className="h-4 w-4"/></button>:<Link to={home} className="stream-icon-button" aria-label="Back home"><ArrowLeftIcon className="h-4 w-4"/></Link>}<h1 className="text-center text-lg font-extrabold">{rail?'Send xStocks':'Send'}</h1></header>
 {rail?<HostedStockSend/>:<div className="mt-5 space-y-3">{([{rail:'arc',title:'USDC',detail:'Arc',Icon:CurrencyDollarIcon},{rail:'xlayer',title:'xStocks',detail:'X Layer',Icon:ChartBarIcon}] as const).map(item=><button key={item.rail} onClick={()=>setRail(item.rail)} className="stream-card flex min-h-20 w-full items-center gap-3 p-4 text-left"><item.Icon className="h-5 w-5 text-gray-500" strokeWidth={1.6}/><span className="flex-1"><span className="block text-sm font-bold">{item.title}</span><span className="mt-1 block text-xs text-gray-400">{item.detail}</span></span><ChevronRightIcon className="h-4 w-4 text-gray-400"/></button>)}</div>}</section>
}
