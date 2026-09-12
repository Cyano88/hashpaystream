import type { Pool } from 'pg'
import { createWalletClient, defineChain, encodeFunctionData, http, keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { STOCK_ESCROW_ABI } from '../src/lib/stockEarlyPayProtocol.js'
import { stockFeeUnits } from '../src/lib/stockFundingOffers.js'
import { createStockChain } from './stock-early-pay-chain.js'
import type { StockConfig } from './stock-early-pay-config.js'
import type { StockStore } from './stock-early-pay.js'
import { applyStockScan, scanStockReceipts, verifyStockReceipt } from './stock-early-pay-reconciliation.js'

type Job = { schema:1; raw:TransactionSerialized; hash:Hex; failed?:boolean }
export type StockSettlementOptions = {
 pool:Pool; config:StockConfig; privateKey:Hex; maxTransactionCostWei:bigint;
 // Fault injection for the isolated database rehearsal, after durable intent and before RPC.
 beforeBroadcast?:()=>Promise<void>
}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()

/** One signer lease, one transaction per pass. Persist the signed transaction before broadcasting.
 * Retry exactly those bytes after a crash or uncertain RPC result. Never allocate a replacement nonce.
 * Dedicated signer required: no other process may spend from this account.
 */
export async function runStockSettlementPass(options:StockSettlementOptions){
 const {pool,config:c,privateKey,maxTransactionCostWei}=options
 // Mainnet sending remains gated until the asset, deployment and signer are reviewed.
 if(c.chainId!==31337||!['localhost','127.0.0.1','[::1]'].includes(new URL(c.rpcUrl).hostname))throw Error('Settlement deployment is not reviewed')
 if(maxTransactionCostWei<=0n)throw Error('Transaction budget required')
 const account=privateKeyToAccount(privateKey)
 if(same(account.address,c.riskSigner))throw Error('Use a dedicated settlement signer')
 const sql=await pool.connect()
 let leased=false
 const key='hashpaystream:stock-early-pay:v1:'+c.chainId+':'+c.escrow.toLowerCase()
 // Across all escrows for this signer, not just this store.
 const lease='stock-settlement:'+c.chainId+':'+account.address.toLowerCase()
 try{
  leased=(await sql.query('select pg_try_advisory_lock(hashtextextended($1,0)) as acquired',[lease])).rows[0].acquired===true
  if(!leased)return {status:'busy'}

  const signerKey='hashpaystream:stock-settlement-signer:v1:'+c.chainId+':'+account.address.toLowerCase()
  await sql.query('insert into render_durable_kv(store_key,value) values($1,$2::jsonb) on conflict(store_key) do nothing',[signerKey,JSON.stringify({schema:1,escrow:c.escrow})])
  const binding=(await sql.query('select value from render_durable_kv where store_key=$1',[signerKey])).rows[0].value
  if(binding.schema!==1||!same(binding.escrow,c.escrow))throw Error('Settlement signer already bound to another escrow')

  const row=await sql.query('select value from render_durable_kv where store_key=$1',[key])
  let store=row.rows[0]?.value as StockStore|undefined
  if(!store)return {status:'empty'}
  if(store.schema!==1)throw Error('Stock schema mismatch')
  const chain=await createStockChain(c)
  const scan=await scanStockReceipts(store,c,chain)
  if(scan){
   await sql.query('begin')
   try{
    const locked=await sql.query('select value from render_durable_kv where store_key=$1 for update',[key])
    const current=locked.rows[0]?.value as StockStore|undefined
    if(!current||current.schema!==1)throw Error('Stock store changed')
    store=applyStockScan(current,scan)
    await sql.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[key,JSON.stringify(store)])
    await sql.query('commit')
   }catch(error){await sql.query('rollback');throw error}
  }
  const network=defineChain({id:c.chainId,name:'Stock settlement',nativeCurrency:{name:'Gas',symbol:'GAS',decimals:18},rpcUrls:{default:{http:[c.rpcUrl]}}})
  const wallet=createWalletClient({account,chain:network,transport:http(c.rpcUrl,{timeout:7000,retryCount:0})})
  // Finish every durable pending job before allocating a new nonce.
  const jobs=await sql.query('select store_key,value from render_durable_kv where starts_with(store_key,$1) order by store_key',[key+':settlement:'])
  for(const row of jobs.rows){
   const id=row.store_key.slice((key+':settlement:').length) as Hex
   const record=store.offers[id]
   if(!record)throw Error('Settlement offer missing')
   const job=row.value as Job
   if(job.schema!==1||keccak256(job.raw)!==job.hash)throw Error('Settlement journal invalid')
   const tx=parseTransaction(job.raw)
   const data=encodeFunctionData({abi:STOCK_ESCROW_ABI,functionName:'settle',args:[id]})
   if(tx.chainId!==c.chainId||!tx.to||!same(tx.to,c.escrow)||tx.data!==data||(tx.value??0n)!==0n||
      !tx.gas||tx.gas*(tx.maxFeePerGas??tx.gasPrice??0n)>maxTransactionCostWei||
      !same(await recoverTransactionAddress({serializedTransaction:job.raw}),account.address))throw Error('Settlement journal target invalid')
   const claim=await chain.claim(id,true)
   if(claim.settled){
    // A third party can settle while our signed intent is still unbroadcast.
    // Keep that nonce reserved until it is consumed or an operator reviews the intent.
    if(await chain.client.getTransactionCount({address:account.address,blockTag:'latest'})<=Number(tx.nonce))return {status:'needs_review'}
    continue
   }
   if(job.failed)return {status:'needs_review'}
   const latest=await chain.claim(id)
   if(latest.settled)return {status:'confirming'}
   if(latest.payAt>chain.now)return {status:'awaiting_due'}
   if(!record.delivery||!await chain.canonical(record.delivery))return {status:'awaiting_delivery'}
   // A consumed nonce with no settled claim needs review; never replace another transaction.
   if(await chain.client.getTransactionCount({address:account.address,blockTag:'latest'})>Number(tx.nonce)){
    const receipt=await chain.client.getTransactionReceipt({hash:job.hash})
    if(chain.blockNumber-receipt.blockNumber+1n<BigInt(c.confirmations))return {status:'confirming'}
    if((await chain.client.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('Noncanonical settlement')
    if(receipt.status==='reverted'){
     await sql.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[row.store_key,JSON.stringify({...job,failed:true})])
     return {status:'needs_review'}
    }
    const result=await chain.receipt(job.hash,id)
    verifyStockReceipt(record,await chain.earnings(record.offer.earningsId,true),result,c)
    return {status:'confirming'}
   }
   await options.beforeBroadcast?.()
   await wallet.sendRawTransaction({serializedTransaction:job.raw})
   return {status:'submitted'}
  }
  for(const record of Object.values(store.offers).sort((a,b)=>a.offer.payAt-b.offer.payAt)){
   if(!record.delivery||!await chain.canonical(record.delivery))continue
   const claim=await chain.claim(record.id,true)
   if(claim.settled||claim.payAt>chain.now||claim.repayment==='0')continue
   const earnings=await chain.earnings(record.offer.earningsId,true)
   const repayment=BigInt(record.offer.principal)+stockFeeUnits(BigInt(record.offer.principal),record.offer.feeBps,c.maxFeeBps)
   if(!same(claim.funder,record.offer.funder)||!same(claim.worker,earnings.worker)||claim.earningsId!==record.offer.earningsId||
      claim.payAt!==record.offer.payAt||BigInt(claim.repayment)!==repayment)throw Error('Settlement terms mismatch')
   if((await chain.claim(record.id)).settled)return {status:'confirming'}
   // No in-flight external transactions on this dedicated signer.
   const [pending,confirmed]=await Promise.all([
    chain.client.getTransactionCount({address:account.address,blockTag:'pending'}),
    chain.client.getTransactionCount({address:account.address,blockTag:'latest'})])
   if(pending!==confirmed)return {status:'signer_pending'}
   await chain.client.simulateContract({account,address:c.escrow,abi:STOCK_ESCROW_ABI,functionName:'settle',args:[record.id]})
   const request=await wallet.prepareTransactionRequest({account,to:c.escrow,value:0n,nonce:pending,
    data:encodeFunctionData({abi:STOCK_ESCROW_ABI,functionName:'settle',args:[record.id]})})
   const cost=request.gas*(request.maxFeePerGas??request.gasPrice??0n)
   if(cost<=0n||cost>maxTransactionCostWei)return {status:'gas_budget'}
   const raw=await wallet.signTransaction(request)
   const job:Job={schema:1,raw,hash:keccak256(raw)}
   // Autocommitted before any network submission. No sensitive transaction bytes in logs.
   await sql.query('insert into render_durable_kv(store_key,value,updated_at) values($1,$2::jsonb,now())',[key+':settlement:'+record.id,JSON.stringify(job)])
   await options.beforeBroadcast?.()
   await wallet.sendRawTransaction({serializedTransaction:raw})
   return {status:'submitted'}
  }
  return {status:'idle'}
 }finally{
  try{if(leased)await sql.query('select pg_advisory_unlock(hashtextextended($1,0))',[lease])}
  finally{sql.release()}
 }
}
