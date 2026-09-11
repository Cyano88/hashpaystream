import { getAbiItem, type Hex } from 'viem'
import { STOCK_ESCROW_ABI } from '../src/lib/stockEarlyPayProtocol.js'
import { stockFeeUnits } from '../src/lib/stockFundingOffers.js'
import type { StockChain } from './stock-early-pay-chain.js'
import type { StockConfig } from './stock-early-pay-config.js'
import { stockFailure as fail } from './stock-early-pay-config.js'
import type { StockStore, StoredOffer } from './stock-early-pay.js'

export type StockScanCursor={blockNumber:string;blockHash:Hex;deploymentBlock:number}
type Receipt=Awaited<ReturnType<StockChain['receipt']>>
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()

/** Shared by client-supplied receipts and automatic event discovery. */
export function verifyStockReceipt(record:StoredOffer,e:Awaited<ReturnType<StockChain['earnings']>>,result:Receipt,c:StockConfig){
 const event=result.event,repayment=BigInt(record.offer.principal)+stockFeeUnits(BigInt(record.offer.principal),record.offer.feeBps,c.maxFeeBps)
 if(event.eventName==='StockDelivered'){
  const a=event.args
  if(!same(a.funder,record.offer.funder)||!same(a.worker,e.worker)||a.earningsId!==record.offer.earningsId||!same(a.asset,c.asset)||
   a.tokenAmount!==BigInt(record.offer.tokenAmount)||a.principal!==BigInt(record.offer.principal)||a.principal+a.fee!==repayment||a.payAt!==e.payAt)fail('Stock delivery does not match the accepted terms.')
 }else if(event.args.amount!==repayment||!same(event.args.funder,record.offer.funder))fail('Repayment does not match the accepted terms.')
}

/** One bounded, read-only chain scan. Persist its result atomically with applyStockScan. */
export async function scanStockReceipts(store:StockStore,c:StockConfig,chain:StockChain){
 const previous=store.receiptCursor
 const confirmed=chain.blockNumber-BigInt(c.confirmations-1)
 if(confirmed<BigInt(c.deploymentBlock))return undefined
 // An incorrect deployment boundary must not silently omit earlier receipts.
 const deployed=await chain.client.getCode({address:c.escrow,blockNumber:BigInt(c.deploymentBlock)})
 const before=c.deploymentBlock>0?await chain.client.getCode({address:c.escrow,blockNumber:BigInt(c.deploymentBlock-1)}):undefined
 if(!deployed||deployed==='0x'||(before&&before!=='0x'))fail('Stock receipt deployment block is incorrect.',503)
 let reset=Boolean(previous&&previous.deploymentBlock!==c.deploymentBlock)
 if(previous&&!reset){
  const height=BigInt(previous.blockNumber)
  reset=height>confirmed||(await chain.client.getBlock({blockNumber:height})).hash!==previous.blockHash
 }
 const from=previous&&!reset?BigInt(previous.blockNumber)+1n:BigInt(c.deploymentBlock)
 if(from>confirmed)return undefined
 const to=from+499n<confirmed?from+499n:confirmed
 const boundary=await chain.client.getBlock({blockNumber:to})
 const logs=await chain.client.getLogs({address:c.escrow,events:[
  getAbiItem({abi:STOCK_ESCROW_ABI,name:'StockDelivered'}),
  getAbiItem({abi:STOCK_ESCROW_ABI,name:'FunderRepaid'})
 ],fromBlock:from,toBlock:to,strict:true})
 const relevant=logs.filter(log=>store.offers[log.args.offerHash])
 if(relevant.length>128)fail('Stock receipt batch exceeds the pilot limit.',503)
 const updates:Array<{id:Hex;kind:'delivery'|'repayment';proof:Receipt['proof']}>=[]
 const seen=new Set<string>()
 for(const log of relevant){
  const id=log.args.offerHash,identity=log.transactionHash+':'+log.logIndex
  if(seen.has(identity))continue
  seen.add(identity)
  const record=store.offers[id]
  const result=await chain.receipt(log.transactionHash,id)
  verifyStockReceipt(record,await chain.earnings(record.offer.earningsId,true),result,c)
  updates.push({id,kind:result.event.eventName==='StockDelivered'?'delivery':'repayment',proof:result.proof})
 }
 if((await chain.client.getBlock({blockNumber:to})).hash!==boundary.hash)fail('Chain changed during receipt verification. Retry.',503)
 return {previous,reset,updates,cursor:{blockNumber:to.toString(),blockHash:boundary.hash,deploymentBlock:c.deploymentBlock} satisfies StockScanCursor}
}

export function applyStockScan(current:StockStore,scan:NonNullable<Awaited<ReturnType<typeof scanStockReceipts>>>):StockStore{
 // A concurrent newer scan wins. Never overwrite requests/offers added during RPC reads.
 if(JSON.stringify(current.receiptCursor)!==JSON.stringify(scan.previous))return current
 const next=structuredClone(current)
 if(scan.reset)for(const offer of Object.values(next.offers)){delete offer.delivery;delete offer.repayment}
 for(const update of scan.updates){
  const offer=next.offers[update.id]
  if(offer)offer[update.kind]=update.proof
 }
 next.receiptCursor=scan.cursor
 return next
}
