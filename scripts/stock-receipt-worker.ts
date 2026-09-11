import pg from 'pg'
import { setTimeout as delay } from 'node:timers/promises'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.js'
import { readStockConfig } from '../api/stock-early-pay-config.js'
import { createStockChain } from '../api/stock-early-pay-chain.js'
import { scanStockReceipts, applyStockScan } from '../api/stock-early-pay-reconciliation.js'
import type { StockStore } from '../api/stock-early-pay.js'

// Reconciles receipts only. Never signs or broadcasts transactions.
async function main(){
 if(process.env.HASHPAYSTREAM_STOCK_RECEIPT_WORKER_ENABLED!=='true')throw Error('disabled')
 const config=readStockConfig(process.env)
 const databaseUrl=String(process.env.DATABASE_URL??process.env.POSTGRES_URL??'').trim()
 if(!databaseUrl)throw Error('database missing')
 const pool=new pg.Pool({...renderDurableStoreConnectionConfig(databaseUrl),max:1,connectionTimeoutMillis:7000,statement_timeout:10000,application_name:'hashpaystream-stock-receipts'})
 const stop=new AbortController()
 const shutdown=()=>stop.abort()
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown)
 const key='hashpaystream:stock-early-pay:v1:'+config.chainId+':'+config.escrow.toLowerCase()
 const once=process.argv.includes('--once')
 try{
  do{
   try{
    const result=await pool.query('select value from render_durable_kv where store_key=$1',[key])
    const store=result.rows[0]?.value as StockStore|undefined
    if(store&&store.schema!==1)throw Error('schema mismatch')
    if(store){
     const chain=await createStockChain(config),scan=await scanStockReceipts(store,config,chain)
     if(scan){
      const client=await pool.connect()
      try{
       await client.query('begin')
       const row=await client.query('select value from render_durable_kv where store_key=$1 for update',[key])
       const current=row.rows[0]?.value as StockStore|undefined
       if(!current||current.schema!==1)throw Error('store changed')
       const next=applyStockScan(current,scan)
       if(next!==current)await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[key,JSON.stringify(next)])
       await client.query('commit')
       console.log(JSON.stringify({component:'stock-receipts',event:'pass_complete',applied:next!==current,receipts:scan.updates.length}))
      }catch(error){await client.query('rollback');throw error}finally{client.release()}
     }
    }
   }catch{
    console.error(JSON.stringify({component:'stock-receipts',event:'verification_failed'}))
    if(once){process.exitCode=1;break}
   }
   if(once||stop.signal.aborted)break
   await delay(15000,undefined,{signal:stop.signal}).catch(()=>{})
  }while(!stop.signal.aborted)
 }finally{
  process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown)
  await pool.end()
 }
}
main().catch(()=>{console.error(JSON.stringify({component:'stock-receipts',event:'startup_failed'}));process.exitCode=1})
