import { createPublicClient, createWalletClient, custom, defineChain, hashTypedData, getAddress, isAddress, keccak256, type Address, type Hex, type EIP1193Provider } from 'viem'
import { STOCK_ESCROW_ABI, STOCK_TOKEN_ABI, STOCK_OFFER_TYPES, stockDomain, stockOfferMessage, type StockOfferWire, type StockRiskWire, type StockClientConfig } from './stockEarlyPayProtocol'
import type { StockOffer } from './stockFundingOffers'

export const stockEarlyPayEnabled = import.meta.env?.VITE_HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED === 'true'
export type StockApiCall = <T>(body?:Record<string,unknown>,query?:Record<string,string>)=>Promise<T>
export type StockBrowserWallet = { address:string; switchChain:(chainId:number)=>Promise<void>; getEthereumProvider:()=>Promise<EIP1193Provider> }
export type StockAcceptance = { config:StockClientConfig; offerId:Hex; offer:StockOfferWire; funderSignature:Hex; risk:StockRiskWire; riskSignature:Hex }
export function validateStockClientConfig(c:StockClientConfig, expectedEscrow:string) {
 if(c.version!==1||![31337,1952].includes(c.chainId)||!isAddress(expectedEscrow)||getAddress(c.escrow)!==getAddress(expectedEscrow)||
    !isAddress(c.usdc)||!isAddress(c.asset)||getAddress(c.asset)===getAddress(c.usdc)||!Number.isInteger(c.maxFeeBps)||c.maxFeeBps<0||c.maxFeeBps>10_000||
    !Number.isInteger(c.confirmations)||c.confirmations<1||c.confirmations>64)throw Error('Stock deployment does not match this app.')
}
export function validateStockAcceptance(data:StockAcceptance,displayed:StockOffer,c:StockClientConfig) {
 const o=data.offer, id=hashTypedData({domain:stockDomain(c.chainId,c.escrow),types:STOCK_OFFER_TYPES,primaryType:'StockOffer',message:stockOfferMessage(o)})
 if(data.config.chainId!==c.chainId||getAddress(data.config.escrow)!==getAddress(c.escrow)||id!==displayed.id||data.offerId!==id||data.risk.offerHash!==id||
    getAddress(o.asset)!==getAddress(c.asset)||o.asset.toLowerCase()!==displayed.asset.toLowerCase()||o.tokenAmount!==displayed.tokenUnits||
    o.principal!==displayed.principalUsdcUnits||o.feeBps!==displayed.feeBps||o.payAt!==displayed.repayAt||o.expiresAt!==displayed.expiresAt||
    o.feeBps>c.maxFeeBps||o.expiresAt<=Math.floor(Date.now()/1000)||data.risk.validUntil<=Math.floor(Date.now()/1000))throw Error('This offer changed or expired. Review a fresh offer.')
}
export async function stockWalletClients(wallet:StockBrowserWallet,c:StockClientConfig,expectedEscrow:string) {
 validateStockClientConfig(c,expectedEscrow)
 await wallet.switchChain(c.chainId)
 const provider=await wallet.getEthereumProvider(),transport=custom(provider)
 const chain=defineChain({id:c.chainId,name:c.chainId===1952?'X Layer Testnet':'Local stock-payment test',nativeCurrency:{name:'Test gas',symbol:c.chainId===1952?'OKB':'ETH',decimals:18},rpcUrls:{default:{http:[]}}})
 const publicClient=createPublicClient({chain,transport}),account=getAddress(wallet.address)
 if(await publicClient.getChainId()!==c.chainId)throw Error('Switch to the stock payment network.')
 const walletClient=createWalletClient({chain,transport,account})
 return {publicClient,walletClient,account}
}
export type PendingStockPayment = { offerId:Hex; txHash?:Hex; stage:'submitting'|'submitted' }
export function stockPendingKey(userId:string,c:StockClientConfig,wallet:string) {return `hashpaystream:stock-pending:v1:${userId}:${c.chainId}:${c.escrow.toLowerCase()}:${wallet.toLowerCase()}`}
export async function confirmStockPayment(input:{api:StockApiCall;wallet:StockBrowserWallet;config:StockClientConfig;expectedEscrow:string;offer:StockOffer;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;storageKey:string}) {
 const {api,wallet,config:c,offer,storage,storageKey}=input
 if(storage.getItem(storageKey))throw Error('Check your pending stock payment before submitting another.')
 const data=await api<StockAcceptance>({action:'acceptance',offerId:offer.id,acceptedRisk:true})
 validateStockAcceptance(data,offer,c)
 const {publicClient,walletClient,account}=await stockWalletClients(wallet,c,input.expectedEscrow)
 const earnings=await publicClient.readContract({address:c.escrow,abi:STOCK_ESCROW_ABI,functionName:'earnings',args:[data.offer.earningsId]})
 if(getAddress(earnings[1])!==account)throw Error('This wallet does not own the approved earnings.')
 const args=[stockOfferMessage(data.offer),data.funderSignature,{...data.risk,policyVersion:BigInt(data.risk.policyVersion)},data.riskSignature] as const
 const simulated=await publicClient.simulateContract({account,address:c.escrow,abi:STOCK_ESCROW_ABI,functionName:'acceptOffer',args})
 storage.setItem(storageKey,JSON.stringify({offerId:data.offerId,stage:'submitting'} satisfies PendingStockPayment))
 try {
  const txHash=await walletClient.writeContract(simulated.request)
  storage.setItem(storageKey,JSON.stringify({offerId:data.offerId,stage:'submitted',txHash} satisfies PendingStockPayment))
  await publicClient.waitForTransactionReceipt({hash:txHash,confirmations:c.confirmations,timeout:60_000})
  await api({action:'receipt',offerId:offer.id,txHash})
  storage.removeItem(storageKey)
 } catch(error) {
  // Only an explicit wallet rejection proves no broadcast. Other failures require recovery.
  const code=(error as {code?:number;cause?:{code?:number}}).code??(error as {cause?:{code?:number}}).cause?.code
  if(code===4001)storage.removeItem(storageKey)
  throw error
 }
}
export async function recoverStockPayment(api:StockApiCall,storage:Pick<Storage,'getItem'|'removeItem'>,key:string) {
 const text=storage.getItem(key);if(!text)return
 const pending=JSON.parse(text) as PendingStockPayment
 if(!/^0x[a-fA-F0-9]{64}$/.test(pending.offerId))throw Error('Pending payment needs manual verification.')
 if(pending.txHash){
  await api({action:'receipt',offerId:pending.offerId,txHash:pending.txHash})
  storage.removeItem(key);return
 }
 const data=await api<{position:{funder:string}}>({action:'position',offerId:pending.offerId})
 if(!/^0x0{40}$/i.test(data.position.funder)) {storage.removeItem(key);return}
 throw Error('The wallet submission is not yet verified. Check wallet activity before trying again.')
}
