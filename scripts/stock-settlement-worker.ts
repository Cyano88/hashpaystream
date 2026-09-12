import pg from 'pg'
import { setTimeout as delay } from 'node:timers/promises'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.js'
import { readStockConfig } from '../api/stock-early-pay-config.js'
import { runStockSettlementPass } from '../api/stock-settlement-worker.js'
import type { Hex } from 'viem'

async function main(){
 if(process.env.HASHPAYSTREAM_STOCK_SETTLEMENT_WORKER_ENABLED!=='true')throw Error('disabled')
 const config=readStockConfig(process.env)
 if(config.chainId!==31337)throw Error('Deployment not reviewed')
 const privateKey=process.env.HASHPAYSTREAM_STOCK_SETTLEMENT_KEY
 const budget=process.env.HASHPAYSTREAM_STOCK_SETTLEMENT_MAX_TX_WEI
 if(!privateKey||!/^0x[0-9a-fA-F]{64}$/.test(privateKey)||!budget||! /^[1-9][0-9]{0,30}$/.test(budget))throw Error('Signer or gas budget missing')
 const databaseUrl=String(process.env.DATABASE_URL??process.env.POSTGRES_URL??'').trim()
 if(!databaseUrl)throw Error('Database missing')
 const pool=new pg.Pool({...renderDurableStoreConnectionConfig(databaseUrl),max:1,connectionTimeoutMillis:7000,statement_timeout:10000,application_name:'hashpaystream-stock-settlement'})
 const stop=new AbortController(),shutdown=()=>stop.abort(),once=process.argv.includes('--once')
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown)
 try{
  do{
   try{
    const result=await runStockSettlementPass({pool,config,privateKey:privateKey as Hex,maxTransactionCostWei:BigInt(budget)})
    console.log(JSON.stringify({component:'stock-settlement',event:'pass_complete',...result}))
   }catch{
    console.error(JSON.stringify({component:'stock-settlement',event:'verification_failed'}))
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
main().catch(()=>{console.error(JSON.stringify({component:'stock-settlement',event:'startup_failed'}));process.exitCode=1})
