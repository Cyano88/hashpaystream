import { formatUnits } from 'viem'

export type StockMarketStatusValue = {
  status: 'indicative' | 'unavailable'
  acceptanceAvailable: false
  assetSymbol?: string
  tokenAmount?: string
  amountOutUsdcUnits?: string
  observedAt?: number
  expiresAt?: number
  issuerOpen?: boolean
}

export default function StockMarketStatus({value}:{value?:StockMarketStatusValue}){
 if(!value||value.status!=='indicative'||!value.assetSymbol||!value.tokenAmount||!value.amountOutUsdcUnits||!value.observedAt)return null
 return <div className="stream-card p-4 text-xs">
  <p className="font-black">Indicative X Layer quote</p>
  <p className="mt-2 font-bold">{formatUnits(BigInt(value.tokenAmount),18)} {value.assetSymbol} currently quotes at {formatUnits(BigInt(value.amountOutUsdcUnits),6)} USDC</p>
  <p className="mt-1 text-[10px] text-gray-400">Snapshot from {new Date(value.observedAt*1000).toLocaleTimeString()}</p>
  <p className="mt-2 leading-5 text-gray-500 dark:text-gray-400">{value.issuerOpen===false
   ?'The US stock market is closed. You can view this on-chain quote, but new stock payments cannot be accepted until the regular session opens and fresh independent pricing passes.'
   :'This on-chain preview cannot be accepted by itself. New stock payments require fresh independent pricing, liquidity and eligibility checks.'}</p>
 </div>
}
