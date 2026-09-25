import { useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, formatUnits, getAddress, http, parseAbi } from 'viem';
import { xLayer } from 'viem/chains';
import XStockTokenPicker, { type ArcPickerToken } from './ui/XStockTokenPicker';
import { communityRequest } from '../lib/tradeCommunity';
import type { XStockPaymentAsset } from '../lib/xStocksAssets';

const balanceAbi=parseAbi(['function balanceOf(address) view returns (uint256)']);
const unsupported=async ():Promise<ArcPickerToken> => {throw Error('Choose a stock approved for this payment.');};
// Reuses Pocket picker rows and balance-first ordering. The caller owns terms;
// this component never signs, quotes a swap, or transfers assets.
export default function XStockPaymentPicker({value,disabled,onChange,getAccessToken,loadAssets}:{
  value:string;disabled?:boolean;onChange(asset:XStockPaymentAsset):void;getAccessToken():Promise<string|null>;loadAssets?():Promise<{enabled:boolean;assets:XStockPaymentAsset[]}>;
}) {
  const {user}=usePrivy(), {ready,wallets}=useWallets();
  const embedded=wallets.filter(wallet=>wallet.walletClientType==='privy');
  const address=ready&&embedded.length===1?embedded[0].address:undefined;
  const scope=(user?.id||'')+':'+(address?.toLowerCase()||'');
  const tokenRef=useRef(getAccessToken);tokenRef.current=getAccessToken;
  const loaderRef=useRef(loadAssets);loaderRef.current=loadAssets;
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{scope:string;assets:XStockPaymentAsset[];tokens:ArcPickerToken[];loading:boolean;balancesLoading:boolean;error:string;balanceError:string;enabled:boolean}>();
  useEffect(()=>{
    let cancelled=false;
    const controller=new AbortController();
    const update=(patch:Partial<NonNullable<typeof state>>)=>{if(!cancelled)setState(previous=>previous?.scope===scope?{...previous,...patch}:previous);};
    setState({scope,assets:[],tokens:[],loading:true,balancesLoading:false,error:'',balanceError:'',enabled:false});
    void (async()=>{
      try {
        const token=await tokenRef.current();if(cancelled)return;
        const response=loaderRef.current?await loaderRef.current():await communityRequest('xlayer-assets',token);if(cancelled)return;
        const assets=response.assets as XStockPaymentAsset[];
        if(!Array.isArray(assets))throw Error('Stock selection is unavailable.');
        const tokens=assets.map(asset=>({...asset,balance:null,balanceStatus:'unavailable'} as ArcPickerToken));
        update({assets,tokens,loading:false,enabled:response.enabled===true,balancesLoading:!!address&&!!assets.length});
        if(!address||!assets.length)return;
        try {
          const client=createPublicClient({chain:xLayer,transport:http('https://rpc.xlayer.tech',{timeout:15000,retryCount:0,fetchOptions:{signal:controller.signal}})});
          if(await client.getChainId()!==196)throw Error('Network mismatch.');
          const block=await client.getBlock({blockTag:'latest'});
          if(!block.hash||Math.abs(Date.now()/1000-Number(block.timestamp))>60)throw Error('Stale balance.');
          const balances=await client.multicall({blockNumber:block.number,batchSize:16_384,contracts:assets.map(asset=>({address:getAddress(asset.address),abi:balanceAbi,functionName:'balanceOf' as const,args:[getAddress(address)] as const}))});
          if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Balance changed.');
          update({tokens:tokens.map((asset,index)=>({...asset,balance:balances[index].status==='success'?formatUnits(balances[index].result as bigint,asset.decimals):null,balanceStatus:balances[index].status==='success'?'available':'unavailable'})),balanceError:balances.some(result=>result.status!=='success')?'Some balances are unavailable.':''});
        }catch{update({balanceError:'Balances are unavailable. Refresh before payment.'});}
        finally{update({balancesLoading:false});}
      }catch(error){update({loading:false,assets:[],tokens:[],error:(error as Error).message});}
    })();
    return()=>{cancelled=true;controller.abort();};
  },[scope,revision]);
  const current=state?.scope===scope?state:undefined;
  return <div className='space-y-2'>
    <p className='text-xs font-bold'>Stock for this payment</p>
    <XStockTokenPicker key={scope} label='Select payment stock' value={value} excluded='' tokens={current?.tokens||[]} networkLabel='X Layer' clean initialLimit={100} balancesLoading={current?.balancesLoading} disabled={disabled||!current||current.loading||!current.assets.length} discover={unsupported} onChange={token=>{const asset=current?.assets.find(asset=>asset.address.toLowerCase()===token.address.toLowerCase());if(asset)onChange(asset);}} />
    {current?.loading&&<p role='status' className='text-xs text-gray-500'>Loading approved stocks…</p>}
    {current&&!current.loading&&!current.error&&!current.assets.length&&<p className='text-xs text-gray-500'>{current.enabled?'No stocks are currently approved for payment.':'Stock payments are not available yet.'}</p>}
    {current?.error&&<p role='alert' className='text-xs text-red-600'>{current.error}</p>}
    {address&&current&&!current.loading&&<p className='text-[10px] text-gray-500'>Balances are from the last refresh. Payment checks your balance again.</p>}
    {current?.balanceError&&<p className='text-xs text-gray-500'>{current.balanceError}</p>}
    {value&&<p className='break-all text-[10px] text-gray-500'>X Layer · {value}</p>}
    <button type='button' disabled={disabled||current?.loading||current?.balancesLoading} onClick={()=>setRevision(value=>value+1)} className='min-h-10 text-xs font-bold underline'>Refresh stocks and balances</button>
  </div>;
}
