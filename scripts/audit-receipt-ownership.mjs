import pg from 'pg'
import { buildReceiptWorkflowPlan,projectionHash } from '../api/receipt-workflow-projection.ts'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'
import { loadWorkflowSources,workflowDatabaseBoundary } from './receipt-workflow-source.mjs'
async function main(){
 if(!process.argv.includes('--confirm-read-only-ownership-audit'))throw Error('READ_ONLY_ATTESTATION_REQUIRED')
 const target=workflowDatabaseBoundary(),pool=new pg.Pool({...renderDurableStoreConnectionConfig(target.toString()),connectionTimeoutMillis:10000});let c
 try{
 c=await pool.connect();await c.query('begin read only');await c.query("set local statement_timeout='20s'")
 if((await c.query('select current_database() as name')).rows[0].name!==decodeURIComponent(target.pathname.slice(1)))throw Error('ACTUAL_DATABASE_NAME_MISMATCH')
 const observations=(await c.query(`select o.observation_id,o.observation_type,o.network,o.contract_address,o.block_number::text,o.payload,o.payload_hash,(select p.occurred_at::text from hashpaystream.ledger_transactions p where p.reference_type='chain_observation' and p.reference_id=o.observation_id and p.status='posted') as occurred_at from hashpaystream.chain_observations o`)).rows;await c.query('rollback')
 const sources=await loadWorkflowSources(observations),plan=buildReceiptWorkflowPlan(sources)
 await new Promise(resolve=>setTimeout(resolve,15000))
 const second=buildReceiptWorkflowPlan(await loadWorkflowSources(observations))
 const changedFields={}
 for(const w of plan.workflows){const other=second.workflows.find(x=>x.agreementId===w.agreementId);for(const key of Object.keys(w))if(projectionHash(w[key])!==projectionHash(other?.[key]))changedFields[key]=(changedFields[key]||0)+1}
 console.log(JSON.stringify({stage:'source_stability_audit',changedFieldCounts:changedFields,productionWrites:0}))
 console.log(JSON.stringify({ok:true,readOnly:true,requests:sources.requests.length,linkedRequests:sources.requests.filter(r=>r.agreementId).length,verifiedParticipantAccounts:new Set(plan.workflows.flatMap(w=>[w.customerReference,w.providerReference])).size,workflows:plan.workflows.length,observations:plan.observationCount,excludedWithoutReceipts:plan.excludedWithoutReceipts,unactivatedDrafts:sources.requests.filter(r=>r.agreementId&&!plan.workflows.some(w=>w.agreementId===r.agreementId)&&r.status==='awaiting_funding'&&sources.drafts[r.agreementId]?.status==='draft').length,agentWorkflows:plan.agentWorkflows,statuses:plan.workflows.reduce((n,w)=>(n[w.status]=(n[w.status]||0)+1,n),{}),productionWrites:0}))
 }finally{c?.release();await pool.end()}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OWNERSHIP_AUDIT_FAILED',productionWrites:0}));process.exitCode=1})
