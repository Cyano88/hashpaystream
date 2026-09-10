import { createPublicClient, http, keccak256, getAddress, decodeEventLog, type Hex, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { STOCK_ESCROW_ABI as ABI, STOCK_TOKEN_ABI, STOCK_OFFER_TYPES, STOCK_RISK_TYPES, stockDomain, stockOfferMessage, type StockOfferWire, type StockRiskWire } from '../src/lib/stockEarlyPayProtocol.js'
import type { StockRiskEvidence } from '../src/lib/stockFundingOffers.js'
import { stockFailure as fail, type StockConfig } from './stock-early-pay-config.js'

export type StockMarketSnapshot = {
 chainId: number; asset: Address; observedAt: number; eligibleUntil: number; unitPriceUsdcUnits: string;
 volatilityBps: number; executableLiquidityUsdcUnits: string; tradingAvailable: boolean; transfersAvailable: boolean; issuerEligible: boolean
}
export type StockReceiptProof = { txHash: Hex; blockNumber: string; blockHash: Hex }
export async function readStockMarket(c: StockConfig): Promise<StockMarketSnapshot> {
 const response = await fetch(c.riskUrl,{signal:AbortSignal.timeout(5000),redirect:'error',cache:'no-store',headers:{accept:'application/json'}})
 if (!response.ok) fail('Stock pricing is unavailable.',503)
 const text = await response.text()
 if (text.length > 16_384) fail('Stock pricing is invalid.',503)
 const result = JSON.parse(text) as StockMarketSnapshot
 return result
}
export function stockMarketEvidence(c: StockConfig, market: StockMarketSnapshot, tokenAmount: bigint, now: number): StockRiskEvidence {
 if (!market || market.chainId !== c.chainId || typeof market.asset !== 'string' || market.asset.toLowerCase() !== c.asset.toLowerCase() ||
     typeof market.unitPriceUsdcUnits !== 'string' || !/^[1-9][0-9]{0,77}$/.test(market.unitPriceUsdcUnits) ||
     !Number.isSafeInteger(market.observedAt) || !Number.isSafeInteger(market.eligibleUntil) ||
     market.observedAt > now || market.eligibleUntil <= now || market.eligibleUntil - market.observedAt > c.maxRiskAge) fail('Stock pricing is invalid or expired.',503)
 return { asset:c.asset,observedAt:market.observedAt,eligibleUntil:market.eligibleUntil,
  volatilityBps:market.volatilityBps,executableLiquidityUsdcUnits:market.executableLiquidityUsdcUnits,
  referenceValueUsdcUnits:(tokenAmount * BigInt(market.unitPriceUsdcUnits) / 10n ** BigInt(c.assetDecimals)).toString(),
  tokenUnits:tokenAmount.toString(),tradingAvailable:market.tradingAvailable,transfersAvailable:market.transfersAvailable,issuerEligible:market.issuerEligible }
}
export async function createStockChain(c: StockConfig) {
 const client = createPublicClient({transport:http(c.rpcUrl,{timeout:7000,retryCount:0})})
 const [chainId,block] = await Promise.all([client.getChainId(),client.getBlock()])
 if (chainId !== c.chainId) fail('Stock RPC network does not match the deployment.',503)
 const common = {address:c.escrow,abi:ABI,blockNumber:block.number} as const
 const [code,usdc,fee,age,signer,paused,version,assetAllowed,decimals] = await Promise.all([
  client.getCode({address:c.escrow,blockNumber:block.number}),
  client.readContract({...common,functionName:'usdc'}),
  client.readContract({...common,functionName:'maxFeeBps'}),
  client.readContract({...common,functionName:'maxRiskAge'}),
  client.readContract({...common,functionName:'riskSigner'}),
  client.readContract({...common,functionName:'paused'}),
  client.readContract({...common,functionName:'policyVersion'}),
  client.readContract({...common,functionName:'allowedAsset',args:[c.asset]}),
  client.readContract({address:c.asset,abi:STOCK_TOKEN_ABI,functionName:'decimals',blockNumber:block.number}),
 ])
 if (!code || keccak256(code).toLowerCase() !== c.runtimeHash.toLowerCase() || getAddress(usdc)!==c.usdc ||
     fee!==c.maxFeeBps || age!==c.maxRiskAge || decimals!==c.assetDecimals) fail('Stock deployment verification failed.',503)
 const now=Number(block.timestamp), domain=stockDomain(c.chainId,c.escrow)
 return {
  client,now,blockNumber:block.number,version,paused,
  assertOpen() { if (paused || !assetAllowed || getAddress(signer)!==c.riskSigner) fail('New stock payments are currently unavailable.') },
  async earnings(id:Hex) {
   const e=await client.readContract({...common,functionName:'earnings',args:[id]})
   if (/^0x0{40}$/i.test(e[0])) fail('Funded earnings were not found.',404)
   return {id,employer:getAddress(e[0]),worker:getAddress(e[1]),available:e[2].toString(),payAt:e[3],approved:e[4]}
  },
  async capacity(funder:Address) {
   const [allowed,inventory]=await Promise.all([
    client.readContract({...common,functionName:'allowedFunder',args:[funder]}),
    client.readContract({...common,functionName:'inventory',args:[funder,c.asset]})])
   return {allowed,inventory:inventory.toString()}
  },
  async used(id:Hex) { return client.readContract({...common,functionName:'usedOffers',args:[id]}) },
  async claim(id:Hex,confirmed=false) {
   const claim=await client.readContract({...common,blockNumber:confirmed?(block.number>=BigInt(c.confirmations-1)?block.number-BigInt(c.confirmations-1):0n):block.number,functionName:'claims',args:[id]})
   return {funder:getAddress(claim[0]),worker:getAddress(claim[1]),earningsId:claim[2],repayment:claim[3].toString(),payAt:claim[4],settled:claim[5]}
  },
  async verifyOffer(offer:StockOfferWire,signature:Hex) {
   return client.verifyTypedData({address:offer.funder,domain,types:STOCK_OFFER_TYPES,primaryType:'StockOffer',message:stockOfferMessage(offer),signature})
  },
  async signRisk(id:Hex,evidence:StockRiskEvidence,expiresAt:number) {
   const risk:StockRiskWire={offerHash:id,observedAt:evidence.observedAt,validUntil:Math.min(evidence.eligibleUntil,expiresAt,evidence.observedAt+c.maxRiskAge),policyVersion:version.toString()}
   if (risk.validUntil<=now) fail('Risk approval expired.')
   const signature=await privateKeyToAccount(c.riskKey).signTypedData({domain,types:STOCK_RISK_TYPES,primaryType:'RiskApproval',message:{...risk,policyVersion:version}})
   return {risk,riskSignature:signature}
  },
  async canonical(proof:StockReceiptProof) {
   const number=BigInt(proof.blockNumber)
   if (number>block.number || block.number-number+1n<BigInt(c.confirmations)) return false
   return (await client.getBlock({blockNumber:number})).hash === proof.blockHash
  },
  async receipt(txHash:Hex,offerId:Hex) {
   const receipt=await client.getTransactionReceipt({hash:txHash})
   if (receipt.status!=='success' || receipt.blockNumber>block.number || block.number-receipt.blockNumber+1n<BigInt(c.confirmations)) fail('Wait for transaction confirmation.')
   if ((await client.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash) fail('Transaction is not on the canonical chain.')
   const events=receipt.logs.flatMap(log=>{
    if (log.address.toLowerCase()!==c.escrow.toLowerCase()) return []
    try {
     const parsed=decodeEventLog({abi:ABI,data:log.data,topics:log.topics,strict:true})
     if ((parsed.eventName==='StockDelivered' || parsed.eventName==='FunderRepaid') && parsed.args.offerHash===offerId) return [parsed]
    } catch { /* unrelated event */ }
    return []
   })
   if (events.length!==1) fail('Transaction does not prove this stock payment.')
   return {event:events[0],proof:{txHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash}}
  }
 }
}
export type StockChain = Awaited<ReturnType<typeof createStockChain>>
