import { tradeCheckoutLink, isTradeCheckoutUrl } from '../lib/tradeCheckoutLink';
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
  onExpired?: () => void; onPaymentState?: (state: number | undefined) => void; wallet?: TradeCheckoutWallet; getAccessToken: () => Promise<string | null>;
}) {
  const {user}=usePrivy();
  return <HostedTrade key={user?.id+':'+props.thread.id+':'+props.offer.id} {...props}/>;
}
type Props=Parameters<typeof TradeCheckout>[0];
type Status={reason?:string;canCloseExpired?:boolean;closed?:boolean;mode:'legacy'|'hosted';enabled?:boolean;ready?:boolean;buyerReady?:boolean;sellerReady?:boolean;needsConnection?:boolean;checkoutUrl?:string;state?:number;pending?:boolean};
function HostedTrade(props:Props){
  const {getAccessToken}=usePrivy();
  const [status,setStatus]=useState<Status>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const finalState=useRef(false),notify=useRef(props.onPaymentState);notify.current=props.onPaymentState;
  const background=useRef<Promise<void>|null>(null);
  const active=useRef(true),lock=useRef(false),cancel=useRef(props.onCancelAvailability);cancel.current=props.onCancelAvailability;
  async function request(action='status'){
    let timer:ReturnType<typeof setTimeout>|undefined;
    const token=await Promise.race([getAccessToken(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Your session is taking too long. Try again.')),15000)})]).finally(()=>clearTimeout(timer));if(!active.current)return;
    const next=await communityRequest('hosted-checkout',token,{threadId:props.thread.id,offerId:props.offer.id,action}) as Status;
    if(!active.current)return;
    if(next.checkoutUrl&&!isTradeCheckoutUrl(next.checkoutUrl))throw Error('Invalid checkout link.');
    finalState.current=next.mode==='hosted'&&!next.pending&&next.state!==undefined&&[6,7,8,9].includes(next.state);notify.current?.(next.pending?undefined:next.state);
    if(next.closed){props.onExpired?.();return;}
    setStatus(previous=>({...next,needsConnection:next.needsConnection||(!next.ready&&!next.checkoutUrl&&previous?.needsConnection)}));setError('');
    if(next.mode==='hosted')cancel.current(!next.checkoutUrl);
  }
  useEffect(()=>{
    active.current=true;cancel.current(false);
    const update=()=>{if(!finalState.current&&!lock.current&&!background.current&&(typeof document==='undefined'||document.visibilityState!=='hidden')){background.current=request().catch(e=>{if(active.current)setError(e.message)}).finally(()=>{background.current=null})}};
    update();const timer=setInterval(update,15000);window.addEventListener('focus',update);window.addEventListener('hashpaystream:resume',update);
    return()=>{active.current=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('hashpaystream:resume',update)};
  },[]);
  async function run(action:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');cancel.current(false);try{await background.current;if(active.current)await request(action)}catch(e){if(active.current)setError((e as Error).message)}finally{lock.current=false;if(active.current)setBusy(false)}}
  if(status?.mode==='legacy')return <PrivyTradeCheckout {...props}/>;
  const button='min-h-11 w-full rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950';
  return <section className='mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-white/10' aria-label='Trade checkout'>
    {!status&&!error&&<button className={button} disabled aria-busy='true'><span role='status'>Checking payment...</span></button>}
    {status?.checkoutUrl?<>
      <p className='text-xs text-gray-500'>{finalState.current?'View the final payment record and agreed terms.':'Review terms and manage this Trade securely with Hash PayLink.'}</p>
      <a className={button+' flex items-center justify-center'} href={tradeCheckoutLink(status.checkoutUrl,props.thread.id)} target='_blank' rel='noreferrer'>{finalState.current?'View payment receipt':status.pending?'View payment progress':'Open Trade checkout'}</a>
      {status.canCloseExpired&&!error&&!status.pending&&<><p className='text-xs text-gray-500'>The payment deadline passed before payment was set up.</p>{props.thread.role==='seller'&&<button className={button} disabled={busy} onClick={()=>void run('close_expired')}>{busy?'Checking expired checkout...':'Close expired checkout'}</button>}</>}
      {!error&&!status.pending&&status.state!==undefined&&<p role='status' className='inline-flex rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-900 dark:bg-white/10 dark:text-white'>{['Waiting for seller','Ready for payment','Payment held securely','Sent or ready for pickup','Inspection period','Disputed','Payment released','Refunded','Resolved','Cancelled'][status.state!]||'Checking payment'}</p>}
    </>:status?.enabled?<>
      {status.needsConnection&&<HostedAccountConnection/>}
      {!status.ready&&<button className={button} disabled={busy} onClick={()=>void run('connect')}>{busy?'Connecting account...':'Use Hash PayLink account'}</button>}
      {status.ready&&!(status.buyerReady&&status.sellerReady)&&<p className='text-xs text-gray-500'>Waiting for the other participant to connect their Hash PayLink account.</p>}
      {status.buyerReady&&status.sellerReady&&(props.thread.role==='buyer'?<button className={button} disabled={busy} onClick={()=>void run('open')}>{busy?'Preparing checkout...':'Continue to checkout'}</button>:<p className='text-xs text-gray-500'>Waiting for the buyer to open checkout.</p>)}
    </>:status&&<p className='text-xs text-gray-500'>{status.reason||'Payments on this network are currently unavailable.'}</p>}
    {error&&<div><p role='alert' className='text-xs text-red-600'>{error}</p><button className='min-h-11 text-xs underline' disabled={busy} onClick={()=>void run('status')}>Try again</button></div>}
  </section>;
}
