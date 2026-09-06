import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {workflowDatabaseBoundary} from './receipt-workflow-source.mjs'
import {renderDurableStoreConnectionConfig} from '../api/durable-store.ts'
async function main(){
 if(!process.argv.includes('--confirm-staging-receipt-sync'))throw Error('STAGING_SYNC_CONFIRMATION_REQUIRED')
 const target=workflowDatabaseBoundary(),pool=new pg.Pool({...renderDurableStoreConnectionConfig(target.toString()),connectionTimeoutMillis:10000,query_timeout:20000});let client,locked=false
 const runId=randomUUID()
 try{
  client=await pool.connect()
  if((await client.query('select current_database() as name')).rows[0].name!==decodeURIComponent(target.pathname.slice(1)))throw Error('ACTUAL_DATABASE_NAME_MISMATCH')
  locked=(await client.query("select pg_try_advisory_lock(hashtext('hashpaystream.receipt-sync.v1')) as locked")).rows[0].locked
  if(!locked){console.log(JSON.stringify({ok:true,status:'already-running',productionWrites:0}));return}
  await client.query("insert into hashpaystream.receipt_sync_health(singleton,state,run_id) values(true,'syncing',$1) on conflict(singleton) do update set state='syncing',run_id=$1,error_code=null,updated_at=now()",[runId])
  const jobs=[['index','scripts/backfill-chain-receipts.mjs','--confirm-staging-chain-index'],['ledger','scripts/backfill-receipt-ledger.mjs','--confirm-staging-ledger-backfill'],['workflows','scripts/backfill-receipt-workflows.mjs','--confirm-staging-workflow-sync']]
  for(const [phase,script,flag]of jobs){
    console.log(JSON.stringify({stage:'receipt_sync',phase,productionWrites:0}))
    const child=spawn(process.execPath,['--import','tsx',script,flag,'--allow-remote-staging-database'],{env:process.env,stdio:'inherit',windowsHide:true,timeout:900000})
    const code=await new Promise(resolve=>{child.on('error',()=>resolve(1));child.on('exit',code=>resolve(code??1))})
    if(code!==0)throw Error('RECEIPT_SYNC_'+phase.toUpperCase()+'_FAILED')
  }
  await client.query("update hashpaystream.receipt_sync_health set state='ready',error_code=null,updated_at=now(),verified_at=now() where singleton=true and run_id=$1",[runId])
  console.log(JSON.stringify({ok:true,status:'ready',productionWrites:0}))
 }catch(e){
  const code=/^[A-Z0-9_]{3,80}$/.test(e.message)?e.message:'RECEIPT_SYNC_FAILED'
  if(client&&locked)await client.query("update hashpaystream.receipt_sync_health set state='blocked',error_code=$2,updated_at=now() where singleton=true and run_id=$1",[runId,code]).catch(()=>{})
  throw Error(code)
 }finally{if(client){if(locked)await client.query("select pg_advisory_unlock(hashtext('hashpaystream.receipt-sync.v1'))").catch(()=>{});client.release()}await pool.end()}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'RECEIPT_SYNC_FAILED',productionWrites:0}));process.exitCode=1})
