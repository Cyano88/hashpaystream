import { useEffect, useRef, useState } from 'react';
import { xStockPaymentLabel } from '../lib/xStocksAssets';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { createPublicClient, http, parseUnits, getAddress, type Hex } from 'viem';
import { communityRequest, type TradeThread } from '../lib/tradeCommunity';
import { tradeTotal, type TradeOffer } from '../lib/tradeAgreement';
import { TRADE_ACTION_LABELS, TRADE_XLAYER_ARBITER, type TradeXLayerAction, type TradeXLayerStatus, type TradeXLayerTransaction } from '../lib/tradeXLayerProtocol';
import { useStreamConfirm } from './ui/StreamConfirmSheet';
const rpc = createPublicClient({transport:http('https://rpc.xlayer.tech', {timeout:15000,retryCount:1})});
const button = 'min-h-11 rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950';
const states = ['Awaiting seller confirmation','Ready for payment','Payment held in escrow','Dispatched','Inspection period','Disputed','Payment released','Refunded','Resolved','Cancelled'];
type Checkout = { offerStatus:string; buyerReady:boolean; sellerReady:boolean; wallet:{address:string;chainId:number}|null; reservation:{id:string}|null };
type Pending = { transaction:TradeXLayerTransaction; hash?:Hex; action:TradeXLayerAction; evidence?:string };
export default function PrivyTradeCheckout({thread,offer,onCancelAvailability}:{thread:TradeThread;offer:TradeOffer;onCancelAvailability:(allowed:boolean)=>void}) {
  const {user,getAccessToken}=usePrivy(), {wallets,ready}=useWallets(), {sendTransaction}=useSendTransaction();
  const embedded=wallets.filter(w=>w.walletClientType==='privy'||w.walletClientType==='privy-v2');
  const wallet=ready&&embedded.length===1?embedded[0]:undefined;
  const identity=`${user?.id||''}:${thread.id}:${offer.id}:${wallet?.address.toLowerCase()||''}`;
  const current=useRef(identity); current.current=identity;
  const mounted=useRef(true), lock=useRef(false);
  const [checkout,setCheckout]=useState<Checkout>(),[status,setStatus]=useState<TradeXLayerStatus>(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[evidence,setEvidence]=useState(''),[pending,setPending]=useState(false);
  const {confirm,confirmation}=useStreamConfirm();
  const storageKey=`hashpaystream:trade-pending:v1:${identity}`;
  function assertCurrent(){if(!mounted.current||current.current!==identity)throw Error('Your account or trade changed. Reopen checkout.');}
  async function request(path:string,payload?:unknown){assertCurrent();const token=await getAccessToken();assertCurrent();const result=await communityRequest(path,token,payload);assertCurrent();return result;}
  const payload={threadId:thread.id,offerId:offer.id};
  async function refresh(){
    const c=await request(`checkout?threadId=${thread.id}&offerId=${offer.id}`);setCheckout(c);
    onCancelAvailability(c.offerStatus==='accepted'&&!c.reservation&&!lock.current);
    const next=await request('xlayer-checkout',payload);setStatus(next);
    setPending(Boolean(localStorage.getItem(storageKey)));
  }
  useEffect(()=>{
    mounted.current=true;setCheckout(undefined);setStatus(undefined);setError('');setBusy('');lock.current=false;
    onCancelAvailability(false);
    const update=()=>{if(!lock.current)void refresh().catch(e=>{if(current.current===identity&&mounted.current)setError(e.message);});};
    update();const timer=setInterval(update,15000);
    return()=>{mounted.current=false;clearInterval(timer);};
  },[identity]);
  async function reconcile(record:Pending){
    if(!record.hash)throw Error('Submission status is uncertain. Check wallet activity before retrying; another payment will not be sent.');
    setBusy('Confirming transaction?');
    const receipt=await rpc.waitForTransactionReceipt({hash:record.hash,confirmations:3,timeout:90000});assertCurrent();
    if(receipt.transactionHash.toLowerCase()!==record.hash.toLowerCase())throw Error('Transaction was replaced. Check wallet activity before continuing.');
    const tx=await rpc.getTransaction({hash:record.hash});assertCurrent();
    if(getAddress(tx.from)!==getAddress(record.transaction.account)||tx.to?.toLowerCase()!==record.transaction.to.toLowerCase()||tx.input!==record.transaction.data||tx.value!==0n)throw Error('Transaction verification failed.');
    localStorage.removeItem(storageKey);setPending(false);
    if(receipt.status!=='success')throw Error('Transaction reverted. No payment was completed. Refresh and try again.');
  }
  async function submit(action:TradeXLayerAction){
    if(!wallet||!user?.id)throw Error('Your embedded trading wallet is not ready. Sign in again.');
    if(localStorage.getItem(storageKey))throw Error('Check the pending transaction before continuing.');
    const plan=await request('xlayer-checkout',{...payload,action,evidence});
    const tx=plan.transaction as TradeXLayerTransaction|undefined;
    if(!tx||tx.chainId!==196||tx.value!=='0'||getAddress(tx.account)!==getAddress(wallet.address))throw Error('Trade transaction does not match your wallet.');
    const expectedToken=offer.terms.currency==='XLAYER_ASSET'?offer.terms.settlementToken:'0xB6CEceAB302E2E4948951eE7843FC24E92933061';
    if(!expectedToken||getAddress(plan.token)!==getAddress(expectedToken)||BigInt(plan.amount)!==parseUnits(tradeTotal(offer.terms),plan.decimals))throw Error('Payment terms changed. Review the agreement.');
    await wallet.switchChain(196);assertCurrent();
    setBusy(action==='approve'?'Preparing payment?':TRADE_ACTION_LABELS[action]+'?');
    const record:Pending={transaction:tx,action,...(evidence?{evidence}:{})};
    localStorage.setItem(storageKey,JSON.stringify(record));setPending(true);
    try {
      const result=await sendTransaction({to:tx.to,data:tx.data,value:0n,chainId:196},{address:wallet.address,uiOptions:{showWalletUIs:false}});
      // Preserve the hash under the original account even if the user switched while signing.
      record.hash=result.hash;localStorage.setItem(storageKey,JSON.stringify(record));assertCurrent();
      await reconcile(record);
    }catch(e){
      const code=(e as {code?:number;cause?:{code?:number}}).code??(e as {cause?:{code?:number}}).cause?.code;
      if(code===4001&&!record.hash){localStorage.removeItem(storageKey);if(current.current===identity)setPending(false);}
      throw e;
    }
  }
  async function run(action:TradeXLayerAction|'wallet'|'reserve'|'recover'){
    if(lock.current)return;lock.current=true;setBusy('Checking trade?');setError('');onCancelAvailability(false);
    try{
      if(action==='recover'){
        const raw=localStorage.getItem(storageKey);if(raw)await reconcile(JSON.parse(raw));
      }else if(action==='wallet'){
        if(!wallet)throw Error('Your embedded wallet is not ready. Sign in again.');
        await request('xlayer-wallet',{...payload,address:wallet.address});
      }else if(action==='reserve'){
        await request('xlayer-checkout',{...payload,reserve:true});
      }else{
        const payment=action==='approve'||action==='fund';
        const accepted=await confirm({title:payment?'Pay into escrow?':TRADE_ACTION_LABELS[action]+'?',description:payment?`${tradeTotal(offer.terms)} ${xStockPaymentLabel(offer.terms)} on X Layer will be held in escrow until release or refund. Network fees are paid in OKB. Token approval is limited to this payment.`:action==='release'?'Release the full escrow payment to the seller. This cannot be undone.':action==='receipt'?'Confirm you received the item and start the agreed inspection period.':`Confirm this action for ${thread.title}. A network fee may apply.`,action:payment?'Confirm payment':TRADE_ACTION_LABELS[action]});
        assertCurrent();if(!accepted)return;
        if(payment){
          // Zero-reset approval, exact approval, then funding; one first-party confirmation.
          let funded=false;
          for(let step=0;step<3;step++){
            const next=await request('xlayer-checkout',payload);
            const operation:TradeXLayerAction|undefined=next.actions.includes('fund')?'fund':next.actions.includes('approve')?'approve':undefined;
            if(!operation)throw Error('Payment state changed. Refresh checkout.');
            await submit(operation);if(operation==='fund'){funded=true;break;}
          }
          if(!funded)throw Error('Approval completed. Refresh to continue payment.');
        }else await submit(action);
      }
    }catch(e){if(current.current===identity&&mounted.current)setError((e as Error).message);}
    finally{if(current.current===identity&&mounted.current){lock.current=false;setBusy('');await refresh().catch(e=>setError(e.message));}}
  }
  const eligible=offer.terms.currency==='USDC'||offer.terms.currency==='XLAYER_ASSET';
  return <section className='space-y-3 border-t border-gray-200 pt-3 dark:border-white/10' aria-label='Trade checkout'>
    {confirmation}<h4 className='text-xs font-bold'>Checkout</h4>
    <details className='text-xs text-gray-500'><summary className='min-h-8 cursor-pointer'>Payment details</summary>
      <p>{tradeTotal(offer.terms)} {xStockPaymentLabel(offer.terms)} ? X Layer</p>
      {offer.terms.settlementToken&&<p className='break-all'>Asset: {offer.terms.settlementToken}</p>}
      <p className='break-all'>Dispute arbitrator: {TRADE_XLAYER_ARBITER}</p>
    </details>
    {!wallet&&<p className='text-xs text-gray-500'>{ready?'Your trading wallet is unavailable. Sign in again to restore it.':'Loading your trading wallet?'}</p>}
    <p className='text-xs text-gray-500'>{status?.state!==undefined?states[status.state]:status?.pending?'Waiting for network confirmation':status?.enabled?'Secure payment on X Layer':'Payments are not available yet.'}</p>
    {checkout?.wallet?.chainId===5042002?<p className='text-xs'>This agreement uses an older wallet setup. Create a new offer to use your trading wallet.</p>:eligible&&<>
      {!checkout?.wallet&&<button className={button} disabled={!!busy||!wallet||!checkout} onClick={()=>void run('wallet')}>Continue with trading wallet</button>}
      {checkout?.wallet&&!(checkout.buyerReady&&checkout.sellerReady)&&<p className='text-xs text-gray-500'>Waiting for the other participant to confirm their trading wallet.</p>}
      {status?.enabled&&checkout?.buyerReady&&checkout.sellerReady&&!checkout.reservation&&thread.role==='buyer'&&<button className={button} disabled={!!busy} onClick={()=>void run('reserve')}>Prepare checkout</button>}
      {checkout?.reservation&&status?.enabled&&!status.actions.length&&status.state===undefined&&!status.pending&&<p className='text-xs text-gray-500'>Waiting for the seller to prepare escrow.</p>}
      {status?.actions.some(a=>['dispatch','refund','dispute'].includes(a))&&<label className='block text-xs'>Delivery reference or explanation<textarea className='mt-1 w-full rounded-xl border bg-transparent p-2' maxLength={2000} value={evidence} onChange={e=>setEvidence(e.target.value)} disabled={!!busy}/></label>}
      {!pending&&status?.actions.map(action=><button key={action} className={button} disabled={!!busy||!wallet||getAddress(checkout!.wallet!.address)!==getAddress(wallet.address)} onClick={()=>void run(action)}>{action==='approve'?'Pay into escrow':TRADE_ACTION_LABELS[action]}</button>)}
    </>}
    {pending&&<button className={button} disabled={!!busy} onClick={()=>void run('recover')}>Check pending transaction</button>}
    {busy&&<p role='status' className='text-xs'>{busy}</p>}
    {error&&<p role='alert' className='text-xs text-red-600'>{error}</p>}
    <button className='min-h-11 text-xs font-bold underline' disabled={!!busy} onClick={()=>void refresh().catch(e=>setError(e.message))}>Refresh checkout</button>
  </section>;
}
