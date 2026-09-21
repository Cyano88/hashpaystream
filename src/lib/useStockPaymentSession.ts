import { useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { fetchWithTimeout } from './fetchWithTimeout'
import type { StockApiCall, StockBrowserWallet } from './stockEarlyPayClient'
export const EXPECTED_STOCK_ESCROW = String(import.meta.env.VITE_HASHPAYSTREAM_STOCK_ESCROW_ADDRESS ?? '').trim()
export function useStockPaymentSession() {
 const {getAccessToken,user}=usePrivy(),{wallets}=useWallets()
 const api:StockApiCall=useCallback(async <T,>(body?:Record<string,unknown>,query?:Record<string,string>):Promise<T>=>{
  const token=await getAccessToken();if(!token)throw Error('Sign in to continue.')
  const response=await fetchWithTimeout('/api/hashpaystream/v1/stock-early-pay'+(query?'?'+new URLSearchParams(query):''),{
   method:body?'POST':'GET',cache:'no-store',headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})
  })
  const data=await response.json().catch(()=>({})) as T&{error?:string}
  if(!response.ok)throw Error(data.error??'Stock payment verification is unavailable.')
  return data
 },[getAccessToken])
 const wallet=useCallback(()=>{const matches=wallets.filter(w=>w.walletClientType==='privy'||w.walletClientType==='privy-v2');if(matches.length!==1)throw Error('Connect your HashPayStream wallet.');return matches[0] as StockBrowserWallet},[wallets])
 return {api,wallet,userId:user?.id??''}
}
