import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import pg from 'pg'
import express from 'express'
import {workflowDatabaseBoundary} from './receipt-workflow-source.mjs'
import {renderDurableStoreConnectionConfig} from '../api/durable-store.ts'
import {registerLedgerAccount,postLedgerTransaction} from '../api/financial-core.ts'
import {buildReceiptWorkflowPlan} from '../api/receipt-workflow-projection.ts'
import {advanceReceiptWorkflows} from '../api/receipt-workflow-incremental.ts'
import {createStagingReceiptHandler} from '../api/staging-receipts.ts'
import {source,observation,customerKey,customerEmail,agreementId,date,token} from './receipt-workflow-fixture.mjs'
async function main(){
 if(!process.argv.includes('--confirm-rollback-only-incremental-check'))throw Error('ROLLBACK_ONLY_INCREMENTAL_CONFIRMATION_REQUIRED')
 const target=workflowDatabaseBoundary(),pool=new pg.Pool({...renderDurableStoreConnectionConfig(target.toString()),connectionTimeoutMillis:10000,query_timeout:30000,max:2})
 const schema='hps_incremental_'+randomBytes(6).toString('hex');let raw,other,server,open=false
 try {
 raw=await pool.connect();other=await pool.connect()
 // Separate database sessions prove overlapping sync jobs cannot both enter the critical section.
 const lock='fixture_'+schema
 assert.equal((await raw.query('select pg_try_advisory_lock(hashtext($1)) as locked',[lock])).rows[0].locked,true)
 assert.equal((await other.query('select pg_try_advisory_lock(hashtext($1)) as locked',[lock])).rows[0].locked,false)
 await raw.query('select pg_advisory_unlock(hashtext($1))',[lock])
 assert.equal((await other.query('select pg_try_advisory_lock(hashtext($1)) as locked',[lock])).rows[0].locked,true)
 await other.query('select pg_advisory_unlock(hashtext($1))',[lock]);other.release();other=undefined
 await raw.query('begin');open=true;await raw.query("set local statement_timeout='30s'")
 const migrations=readdirSync('api/migrations').filter(f=>/^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort()
 for(const f of migrations)await raw.query(readFileSync('api/migrations/'+f,'utf8').replace(/\bhashpaystream\b/g,schema))
 const client={query:(sql,params)=>raw.query(sql.replace(/\bhashpaystream\b/g,schema),params)}
 for(const accountId of ['fixture_sender','fixture_recipient'])await registerLedgerAccount(client,{accountId,identityDomain:'system',ownerReference:'fixture:'+accountId,network:'arc-testnet',assetAddress:token,purpose:'external_clearing'})
 let seq=0
 async function insertEvidence(o){
  const n=++seq,tx='0x'+n.toString(16).padStart(64,'0'),block='0x'+'a'.repeat(64)
  await client.query(`insert into hashpaystream.chain_observations(observation_id,network,chain_id,transaction_hash,log_index,observation_type,block_number,block_hash,contract_address,event_name,payload_hash,payload) values($1,'arc-testnet',5042002,$2,0,'confirmed',$3,$4,$5,$6,$7,$8::jsonb)`,[o.observation_id,tx,o.block_number,block,o.contract_address,o.payload.eventName,o.payload_hash,JSON.stringify(o.payload)])
  await postLedgerTransaction(client,{postingId:'posting_fixture_'+n,postingKey:'fixture:'+n,referenceType:'chain_observation',referenceId:o.observation_id,network:'arc-testnet',assetAddress:token,occurredAt:date,entries:[{lineNumber:1,accountId:'fixture_sender',side:'debit',amountUnits:o.payload.eventAmounts.amount,memoCode:'fixture.transfer'},{lineNumber:2,accountId:'fixture_recipient',side:'credit',amountUnits:o.payload.eventAmounts.amount,memoCode:'fixture.transfer'}]},{callerTransaction:true})
 }
 const input=structuredClone(source);input.attempts[0].lifecycle.status='active';input.observations=input.observations.slice(0,1)
 await insertEvidence(input.observations[0]);assert.deepEqual(await advanceReceiptWorkflows(client,buildReceiptWorkflowPlan(input)),{inserted:1,updated:0,duplicate:0})
 const early=structuredClone(buildReceiptWorkflowPlan(input))
 input.observations.push(observation('StepReleased','200000000','obs_partial'));await insertEvidence(input.observations.at(-1))
 assert.equal((await advanceReceiptWorkflows(client,buildReceiptWorkflowPlan(input))).updated,1)
 input.observations.push(observation('StepReleased','300000000','obs_complete'));await insertEvidence(input.observations.at(-1))
 const complete=buildReceiptWorkflowPlan(input);assert.equal((await advanceReceiptWorkflows(client,complete)).updated,1)
 const revision=(await client.query('select source_version::text from hashpaystream.agreement_projections')).rows[0].source_version
 assert.equal(revision,'201');assert.equal((await advanceReceiptWorkflows(client,complete)).duplicate,1)
 assert.equal(Number((await client.query('select count(*)::int as n from hashpaystream.receipt_projection_history')).rows[0].n),3)
 async function reject(name,fn,code){await raw.query('savepoint '+name);await assert.rejects(fn,new RegExp(code));await raw.query('rollback to savepoint '+name)}
 await reject('stale',()=>advanceReceiptWorkflows(client,early),'WORKFLOW_INCREMENTAL_EVIDENCE_REQUIRED')
 const changed=structuredClone(complete);changed.workflows[0].sourceHash='0'.repeat(64)
 await reject('same_evidence',()=>advanceReceiptWorkflows(client,changed),'WORKFLOW_INCREMENTAL_EVIDENCE_REQUIRED')
 await reject('history_change',()=>client.query("delete from hashpaystream.receipt_projection_history"),'APPEND_ONLY_RECORD_IMMUTABLE')
 const env={HASHPAYSTREAM_DATABASE_ENVIRONMENT:'staging',HASHPAYSTREAM_STAGING_RECEIPTS_ENABLED:'true',DATABASE_URL:target.toString(),HASHPAYSTREAM_APP_OWNERSHIP_SECRET:source.secret}
 const app=express();app.all('/agreements/:agreementId/receipts',createStagingReceiptHandler({env:()=>env,identity:async req=>{if(req.headers.authorization==='Bearer synthetic-customer')return {userId:'synthetic-user',email:customerEmail};if(req.headers.authorization==='Bearer synthetic-stranger')return {userId:'synthetic-stranger',email:'stranger@example.test'};throw Object.assign(Error('INVALID_TOKEN'),{status:401})},withClient:async(_env,fn)=>fn(client)}))
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 const url=`http://127.0.0.1:${server.address().port}/agreements/${agreementId}/receipts`
 const request=(token='synthetic-customer',suffix='',method='GET')=>fetch(url+suffix,{method,headers:{authorization:'Bearer '+token}})
 assert.equal((await request()).status,503)
 await client.query("insert into hashpaystream.receipt_sync_health(singleton,state,run_id,verified_at) values(true,'ready',$1,now())",[randomUUID()])
 const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.role,'customer');assert.equal(body.receipts.length,3);assert.equal(body.availableBalance,null)
 assert.equal((await request('bad-token')).status,401)
 assert.equal((await request('synthetic-stranger','?accountReference='+customerKey+'&identityDomain=human')).status,404)
 assert.equal((await request('synthetic-customer','','POST')).status,405)
 await client.query("update hashpaystream.receipt_sync_health set state='blocked'");assert.equal((await request()).status,503)
 await client.query("update hashpaystream.receipt_sync_health set state='ready',verified_at=now()-interval '16 minutes'");assert.equal((await request()).status,503)
 await client.query("update hashpaystream.receipt_sync_health set verified_at=now()");assert.equal((await request()).status,200)
 env.HASHPAYSTREAM_DATABASE_ENVIRONMENT='production';assert.equal((await request()).status,404);env.HASHPAYSTREAM_DATABASE_ENVIRONMENT='staging'
 await raw.query('savepoint reorg_read')
 await client.query(`insert into hashpaystream.chain_observations(observation_id,network,chain_id,transaction_hash,log_index,observation_type,block_number,block_hash,contract_address,event_name,payload_hash,payload) select 'reorg_fixture',network,chain_id,transaction_hash,log_index,'reorged',block_number,block_hash,contract_address,event_name,payload_hash,payload from hashpaystream.chain_observations where observation_id=$1`,[input.observations[0].observation_id])
 assert.equal((await request()).status,503);await raw.query('rollback to savepoint reorg_read');assert.equal((await request()).status,200)
 await raw.query('rollback');open=false
 assert.equal((await raw.query('select exists(select 1 from information_schema.schemata where schema_name=$1) as present',[schema])).rows[0].present,false)
 console.log(JSON.stringify({ok:true,rollbackOnly:true,migrations:migrations.length,incrementalUpdates:2,sameBlockRevision:revision,duplicateRejected:true,staleReplayRejected:true,historyImmutable:true,concurrentRunExcluded:true,httpAccessChecks:12,reorgReadBlocked:true,transientReadRecovery:true,fixtureSchemaPersisted:false,productionWrites:0}))
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}if(raw&&open)await raw.query('rollback').catch(()=>{});other?.release();raw?.release();await pool.end()}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]{3,80}$/.test(e.message)?e.message:'INCREMENTAL_HARNESS_FAILED',sqlState:/^[A-Z0-9]{5}$/.test(e.code||'')?e.code:undefined,productionWrites:0}));process.exitCode=1})
