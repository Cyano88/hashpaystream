import {useEffect,useState} from 'react'
import {communityRequest} from '../lib/tradeCommunity'
import type {TradeTerms} from '../lib/tradeAgreement'
import {chooseTradePayment,tradePaymentChoice,type TradeRailAvailability} from '../lib/tradePaymentChoice'
import {StreamSelect} from './ui/StreamSelect'
const closed:TradeRailAvailability={arc:false,xlayer:false}
export default function TradePaymentPicker({terms,onChange,onAvailability,getAccessToken,disabled}:{terms:TradeTerms;onChange:(terms:TradeTerms)=>void;onAvailability:(available:TradeRailAvailability)=>void;getAccessToken:()=>Promise<string|null>;disabled:boolean}){
  const [available,setAvailable]=useState(closed),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  useEffect(()=>{
    let active=true;setLoading(true);setError('');setAvailable(closed);onAvailability(closed)
    void (async()=>{
      const token=await getAccessToken();if(!active)return
      const result=await communityRequest('payment-rails',token)
      if(!active)return
      if(result.arc?.chainId!==5042||result.xlayer?.chainId!==196||typeof result.arc?.enabled!=='boolean'||typeof result.xlayer?.enabled!=='boolean')throw Error('Payment networks could not be verified.')
      const next={arc:result.arc.enabled,xlayer:result.xlayer.enabled};setAvailable(next);onAvailability(next)
    })().catch(error=>{if(active)setError(error.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[getAccessToken,onAvailability,revision])
  const value=tradePaymentChoice(terms)
  return <div>
    <StreamSelect label='Payment' value={value} disabled={disabled||loading} options={[
      ...(value==='legacy'?[{value:'legacy',label:`Previous ${terms.currency} quote · choose payment`,disabled:true}]:[]),
      {value:'arc',label:'USDC on Arc'+(available.arc?'':' · Unavailable'),disabled:!available.arc},
      {value:'xlayer',label:'xStocks on XLayer'+(available.xlayer?'':' · Unavailable'),disabled:!available.xlayer},
    ]} onChange={value=>{if(value==='arc'||value==='xlayer')onChange(chooseTradePayment(terms,value,available))}}/>
    {loading?<div role='status' aria-label='Checking payment networks' className='mt-2 h-3 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-white/10'/>:<>
      <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>{value==='legacy'?'The previous quote is preserved. Choose a payment network and enter its agreed amount.':'Changing payment networks clears the amount. Both participants must accept the new terms.'}</p>
      {error&&<p role='alert' className='mt-2 text-xs text-red-600'>{error}</p>}
      {(!available.arc||!available.xlayer)&&<button type='button' disabled={disabled} className='mt-1 min-h-9 text-xs underline' onClick={()=>setRevision(value=>value+1)}>Refresh payment options</button>}
    </>}
  </div>
}
