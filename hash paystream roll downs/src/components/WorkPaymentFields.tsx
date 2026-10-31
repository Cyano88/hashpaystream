import { usePrivy } from '@privy-io/react-auth';
import XStockPaymentPicker from './XStockPaymentPicker';
import { StreamSelect } from './ui/StreamSelect';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import type { XStockPaymentAsset } from '../lib/xStocksAssets';
export type WorkPaymentMode='arc'|'xlayer-usdc'|'stock';
export default function WorkPaymentFields({mode,token,reviewHours,disabled,onMode,onToken,onReview,allowNetworkChange=true}:{mode:WorkPaymentMode;token:string;reviewHours:number;disabled?:boolean;onMode(mode:WorkPaymentMode):void;onToken(token:string):void;onReview(hours:number):void;allowNetworkChange?:boolean}){
  const {getAccessToken}=usePrivy();
  const loadAssets=async()=>{const access=await getAccessToken();if(!access)throw Error('Sign in again.');const response=await fetchWithTimeout('/api/hashpaystream/v1/service-requests',{method:'POST',cache:'no-store',headers:{authorization:'Bearer '+access,'content-type':'application/json'},body:JSON.stringify({action:'work_xlayer_assets'})});const data=await response.json();if(!response.ok)throw Error(data.error||'Work payment assets unavailable.');return data as {enabled:boolean;assets:XStockPaymentAsset[]};};
  const options=[{value:'arc',label:'USDC - Arc'},...((import.meta.env.VITE_HASHPAYSTREAM_WORK_XLAYER_ENABLED==='true'||mode!=='arc')?[{value:'xlayer-usdc',label:'USDC - X Layer'},{value:'stock',label:'Tokenized stocks - X Layer'}]:[])];
  return <div className='space-y-3'>
    <StreamSelect label='Payment asset' value={mode} options={allowNetworkChange?options:options.filter(option=>mode==='arc'?option.value==='arc':option.value!=='arc')} disabled={disabled} onChange={value=>onMode(value as WorkPaymentMode)}/>
    {mode==='stock'&&<XStockPaymentPicker value={token} disabled={disabled} onChange={asset=>onToken(asset.address)} getAccessToken={getAccessToken} loadAssets={loadAssets}/>}
    {mode!=='arc'&&<><StreamSelect label='Client review period' value={String(reviewHours)} options={[24,48,72].map(hours=>({value:String(hours),label:hours+' hours'}))} disabled={disabled} onChange={value=>onReview(Number(value))}/><p className='text-xs text-gray-500'>One release on X Layer. Enter the exact token quantity. The client starts the review period after receiving the work; submission alone does not release payment. The token amount stays fixed as its dollar value changes.</p></>}
  </div>;
}
