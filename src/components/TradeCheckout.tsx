import PrivyTradeCheckout from './PrivyTradeCheckout';
import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import HostedAccountConnection from './HostedAccountConnection';
import { communityRequest } from '../lib/tradeCommunity';
export type TradeCheckoutWallet = {
  state: string;
  session?: { userToken: string; wallet: { id: string; address: string } };
  reconnect: () => Promise<void>;
};
// New Trades use hosted checkout; existing local escrows retain their recovery UI.
export default function TradeCheckout(props: Parameters<typeof PrivyTradeCheckout>[0] & {
  wallet?: TradeCheckoutWallet; getAccessToken: () => Promise<string | null>;
}) {
  const {user}=usePrivy();
  return <HostedTrade key={user?.id+':'+props.thread.id+':'+props.offer.id} {...props}/>;
}
type Props=Parameters<typeof TradeCheckout>[0];
type Status={mode:'legacy'|'hosted';enabled?:boolean;ready?:boolean;buyerReady?:boolean;sellerReady?:boolean;needsConnection?:boolean;checkoutUrl?:string;state?:number};
function HostedTrade(props:Props){
  const {getAccessToken}=usePrivy();
  const [status,setStatus]=useState<Status>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const active=useRef(true),lock=useRef(false),cancel=useRef(props.onCancelAvailability);cancel.current=props.onCancelAvailability;
  async function request(action='status'){
    const token=await getAccessToken();if(!active.current)return;
    const next=await communityRequest('hosted-checkout',token,{threadId:props.thread.id,offerId:props.offer.id,action}) as Status;
    if(!active.current)return;
    if(next.checkoutUrl&&!/^https:\/\/app\.hashpaylink\.com\/agreements\/xstocks\/xag_[a-f0-9]{64}$/.test(next.checkoutUrl))throw Error('Invalid checkout link.');
    setStatus(previous=>({...next,needsConnection:next.needsConnection||(!next.ready&&!next.checkoutUrl&&previous?.needsConnection)}));setError('');
    if(next.mode==='hosted')cancel.current(!next.checkoutUrl);
  }
  useEffect(()=>{
    active.current=true;cancel.current(false);
    const update=()=>{if(!lock.current){lock.current=true;void request().catch(e=>{if(active.current)setError(e.message)}).finally(()=>{lock.current=false})}};
    update();const timer=setInterval(update,15000);window.addEventListener('focus',update);window.addEventListener('hashpaystream:resume',update);
    return()=>{active.current=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('hashpaystream:resume',update)};
  },[]);
  async function run(action:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');cancel.current(false);try{await request(action)}catch(e){if(active.current)setError((e as Error).message)}finally{lock.current=false;if(active.current)setBusy(false)}}
  if(status?.mode==='legacy')return <PrivyTradeCheckout {...props}/>;
  const button='min-h-11 w-full rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950';
  return <section className='mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-white/10' aria-label='Trade checkout'>
    {!status&&!error&&<div role='status' className='h-11 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5'><span className='sr-only'>Loading checkout</span></div>}
    {status?.checkoutUrl?<>
      <p className='text-xs text-gray-500'>Review terms and manage this Trade securely with Hash PayLink.</p>
      <a className={button+' flex items-center justify-center'} href={status.checkoutUrl} target='_blank' rel='noreferrer'>Open Trade checkout</a>
      {status.state!==undefined&&<p className='text-xs text-gray-500'>{['Awaiting seller confirmation','Ready for payment','Payment held in escrow','Dispatched','Inspection period','Disputed','Payment released','Refunded','Resolved','Cancelled'][status.state]||'Checking payment'}</p>}
    </>:status?.enabled?<>
      {status.needsConnection&&<HostedAccountConnection/>}
      {!status.ready&&<button className={button} disabled={busy} onClick={()=>void run('connect')}>{busy?'Checking account?':'Use Hash PayLink account'}</button>}
      {status.ready&&!(status.buyerReady&&status.sellerReady)&&<p className='text-xs text-gray-500'>Waiting for the other participant to connect their Hash PayLink account.</p>}
      {status.buyerReady&&status.sellerReady&&(props.thread.role==='buyer'?<button className={button} disabled={busy} onClick={()=>void run('open')}>{busy?'Preparing checkout?':'Continue to checkout'}</button>:<p className='text-xs text-gray-500'>Waiting for the buyer to open checkout.</p>)}
    </>:status&&<p className='text-xs text-gray-500'>Stock payments are not available yet.</p>}
    {error&&<div><p role='alert' className='text-xs text-red-600'>{error}</p><button className='min-h-11 text-xs underline' disabled={busy} onClick={()=>void run('status')}>Try again</button></div>}
  </section>;
}
