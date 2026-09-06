import { advanceReceiptWorkflows } from '../api/receipt-workflow-incremental.ts'
import pg from 'pg'
import { spawn } from 'node:child_process'
import { buildReceiptWorkflowPlan,projectionHash } from '../api/receipt-workflow-projection.ts'
import { persistReceiptWorkflows,readStagingReceiptWorkflow } from '../api/receipt-workflow-store.ts'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'
import { loadWorkflowSources,workflowDatabaseBoundary } from './receipt-workflow-source.mjs'
const observationSql=`select o.observation_id,o.observation_type,o.network,o.contract_address,o.block_number::text,o.payload,o.payload_hash,(select p.occurred_at::text from hashpaystream.ledger_transactions p where p.reference_type='chain_observation' and p.reference_id=o.observation_id and p.status='posted') as occurred_at from hashpaystream.chain_observations o order by observation_id`
const incremental=process.argv.includes('--confirm-staging-workflow-sync')
const write=process.argv.includes('--confirm-staging-workflow-backfill')||incremental,rollback=process.argv.includes('--confirm-rollback-only-workflow-check')
async function main(){
 if(Number(process.argv.includes('--confirm-staging-workflow-backfill'))+Number(incremental)+Number(rollback)!==1)throw Error('EXACTLY_ONE_WORKFLOW_MODE_REQUIRED')
 const target=workflowDatabaseBoundary()
 const pool=new pg.Pool({...renderDurableStoreConnectionConfig(target.toString()),connectionTimeoutMillis:10000,query_timeout:30000});let c,open=false
 try {
 c=await pool.connect();if((await c.query('select current_database() as name')).rows[0].name!==decodeURIComponent(target.pathname.slice(1)))throw Error('ACTUAL_DATABASE_NAME_MISMATCH')
 const observations=(await c.query(observationSql)).rows
 const sources=await loadWorkflowSources(observations),plan=buildReceiptWorkflowPlan(sources),sourceHash=projectionHash(plan)
 const legacyStates=new Map()
 for(const event of [...sources.events].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){const state=event.event==='agreement.expired'?'expired':event.event==='agreement.completed'?'completed':event.event==='agreement.refunded'?'refunded':['agreement.activated','agreement.step_released'].includes(event.event)?'funded':null;if(state)legacyStates.set(event.agreementId,state)}
 for(const w of plan.workflows){if(legacyStates.get(w.agreementId)!==(w.status==='active'?'funded':w.status))throw Error('WORKFLOW_LEGACY_STATE_MISMATCH')}
 console.log(JSON.stringify({stage:'workflow_plan_verified',workflows:plan.workflows.length,observations:plan.observationCount,excludedWithoutReceipts:plan.excludedWithoutReceipts,productionWrites:0}))
 // Reverify canonical chain evidence and posted entries again immediately before staging work.
 const job=spawn(process.execPath,['--import','tsx','scripts/backfill-receipt-ledger.mjs','--confirm-rollback-only-ledger-check','--allow-remote-staging-database'],{env:process.env,stdio:'inherit',windowsHide:true,timeout:900000})
 const code=await new Promise(resolve=>{job.on('error',()=>resolve(1));job.on('exit',code=>resolve(code??1))})
 if(code!==0)throw Error('WORKFLOW_CHAIN_REVERIFICATION_FAILED')
 if(projectionHash(buildReceiptWorkflowPlan(await loadWorkflowSources(observations)))!==sourceHash)throw Error('WORKFLOW_SOURCE_CHANGED_DURING_AUDIT')
 await c.query('begin isolation level serializable');open=true
 await c.query("set local statement_timeout='30s'");await c.query("set local lock_timeout='5s'")
 await c.query("select pg_advisory_xact_lock(hashtext('hashpaystream.receipt-workflow.v1'))")
 if(projectionHash((await c.query(observationSql)).rows)!==projectionHash(observations))throw Error('WORKFLOW_OBSERVATIONS_CHANGED')
 const before=Number((await c.query('select count(*)::int as count from hashpaystream.agreement_projections')).rows[0].count)
 const persist=incremental?advanceReceiptWorkflows:persistReceiptWorkflows
 const first=await persist(c,plan),second=await persist(c,plan)
 if(second.inserted!==0||(second.updated||0)!==0||second.duplicate!==plan.workflows.length)throw Error('WORKFLOW_REPLAY_NOT_IDEMPOTENT')
 let authorizedReads=0,deniedReads=0
 for(const w of plan.workflows){
  for(const [accountReference,role]of [[w.customerReference,'customer'],[w.providerReference,'provider']]){
   const view=await readStagingReceiptWorkflow(c,{identityDomain:'human',accountReference},w.agreementId)
   if(!view||view.role!==role||projectionHash(view.projection)!==projectionHash(w.projection)||view.receipts.length!==w.projection.observationIds.length||view.availableBalance!==null)throw Error('WORKFLOW_SHADOW_READ_MISMATCH')
   authorizedReads++
  }
  for(const principal of [{identityDomain:'human',accountReference:'0'.repeat(64)},{identityDomain:'agent',accountReference:w.customerReference}]){
   if(await readStagingReceiptWorkflow(c,principal,w.agreementId))throw Error('WORKFLOW_CROSS_IDENTITY_READ_ALLOWED');deniedReads++
  }
 }
 const bindings=Number((await c.query('select count(*)::int as count from hashpaystream.agreement_receipt_bindings')).rows[0].count)
 if(bindings!==plan.observationCount)throw Error('WORKFLOW_BINDING_COVERAGE_MISMATCH')
 await c.query('savepoint binding_mutation_check');let immutableBinding=false
 try {await c.query('delete from hashpaystream.agreement_receipt_bindings where observation_id=$1',[plan.workflows[0].projection.observationIds[0]])}catch(e){if(e.message!=='APPEND_ONLY_RECORD_IMMUTABLE')throw e;immutableBinding=true}
 await c.query('rollback to savepoint binding_mutation_check');if(!immutableBinding)throw Error('WORKFLOW_BINDING_MUTATION_ALLOWED')
 await c.query('savepoint reorg_read_check')
 const firstWorkflow=plan.workflows[0],firstObservation=firstWorkflow.projection.observationIds[0]
 await c.query(`insert into hashpaystream.chain_observations (observation_id,network,chain_id,transaction_hash,log_index,observation_type,block_number,block_hash,contract_address,event_name,payload_hash,payload)
   select 'reorg_audit_'||observation_id,network,chain_id,transaction_hash,log_index,'reorged',block_number,block_hash,contract_address,event_name,payload_hash,payload from hashpaystream.chain_observations where observation_id=$1`,[firstObservation])
 let reorgRejected=false
 try {await readStagingReceiptWorkflow(c,{identityDomain:'human',accountReference:firstWorkflow.customerReference},firstWorkflow.agreementId)}catch(e){if(e.message!=='WORKFLOW_READ_EVIDENCE_INCOMPLETE')throw e;reorgRejected=true}
 await c.query('rollback to savepoint reorg_read_check');if(!reorgRejected)throw Error('WORKFLOW_REORG_READ_ALLOWED')
 await c.query('savepoint changed_workflow');let rejected=false
 try {const changed=structuredClone(plan);changed.workflows[0].sourceHash='0'.repeat(64);await persistReceiptWorkflows(c,changed)}catch(e){if(e.message!=='WORKFLOW_PROJECTION_REPLAY_CONFLICT')throw e;rejected=true}
 await c.query('rollback to savepoint changed_workflow');if(!rejected)throw Error('WORKFLOW_CHANGED_REPLAY_ACCEPTED')
 await c.query(write?'commit':'rollback');open=false
 const persisted=Number((await c.query('select count(*)::int as count from hashpaystream.agreement_projections')).rows[0].count)
 if(persisted!==(write?plan.workflows.length:before))throw Error('WORKFLOW_PERSISTENCE_MISMATCH')
 console.log(JSON.stringify({ok:true,mode:write?'staging-write':'rollback-only',workflows:plan.workflows.length,bindings,firstPass:first,secondPass:second,authorizedReads,deniedReads,shadowComparison:'matched',legacyLifecycleComparison:'matched',changedReplayRejected:true,reorgReadRejected:true,bindingMutationRejected:true,persistedProjections:persisted,excludedWithoutReceipts:plan.excludedWithoutReceipts,agentWorkflows:0,productionWrites:0}))
 }finally{if(c&&open)await c.query('rollback').catch(()=>{});c?.release();await pool.end()}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'WORKFLOW_BACKFILL_FAILED',productionWrites:0}));process.exitCode=1})
