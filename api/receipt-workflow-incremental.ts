import type { SqlClient } from './financial-core.js'
import { persistReceiptWorkflows } from './receipt-workflow-store.js'
import { projectionHash, type buildReceiptWorkflowPlan } from './receipt-workflow-projection.js'
type Plan = ReturnType<typeof buildReceiptWorkflowPlan>
const terminal = new Set(['completed','refunded'])

// Caller owns a serializable transaction. Receipt replacement/reversal is intentionally rejected.
export async function advanceReceiptWorkflows(client: SqlClient, plan: Plan) {
  await client.query("select pg_advisory_xact_lock(hashtext('hashpaystream.receipt-workflow.v1'))")
  const result={inserted:0,updated:0,duplicate:0}
  async function history(id:string,revision:string,hash:string,projection:unknown) {
    await client.query('insert into hashpaystream.receipt_projection_history(agreement_id,revision,source_hash,projection) values($1,$2,$3,$4::jsonb) on conflict(agreement_id,revision) do nothing',[id,revision,hash,JSON.stringify(projection)])
    const row=(await client.query<any>('select source_hash,projection from hashpaystream.receipt_projection_history where agreement_id=$1 and revision=$2',[id,revision])).rows[0]
    if(row?.source_hash!==hash||projectionHash(row.projection)!==projectionHash(projection))throw Error('WORKFLOW_HISTORY_CONFLICT')
  }
  for(const incoming of plan.workflows) {
    const w=structuredClone(incoming)
    const old=(await client.query<any>('select source_version::text,source_hash,projection from hashpaystream.agreement_projections where agreement_id=$1 for update',[w.agreementId])).rows[0]
    if(old) {
      await history(w.agreementId,old.source_version,old.source_hash,old.projection)
      if(old.source_hash===w.sourceHash) {w.sourceVersion=old.source_version;result.duplicate++}
      else {
        const previous=new Set<string>(old.projection.observationIds),next=new Set<string>(w.projection.observationIds)
        if(next.size<=previous.size||[...previous].some(id=>!next.has(id)))throw Error('WORKFLOW_INCREMENTAL_EVIDENCE_REQUIRED')
        if(terminal.has(old.projection.status)&&old.projection.status!==w.status)throw Error('WORKFLOW_TERMINAL_REGRESSION')
        if(BigInt(w.projection.releasedUsdcUnits)<BigInt(old.projection.releasedUsdcUnits)||BigInt(w.projection.refundedUsdcUnits)<BigInt(old.projection.refundedUsdcUnits))throw Error('WORKFLOW_AMOUNT_REGRESSION')
        // The source hash fingerprints evidence; revision also advances for receipts in the same block or on X Layer.
        w.sourceVersion=(BigInt(w.sourceVersion)>BigInt(old.source_version)?BigInt(w.sourceVersion):BigInt(old.source_version)+1n).toString()
        await client.query('update hashpaystream.service_requests set status=$2,updated_at=$3 where request_id=$1',[w.requestId,w.requestStatus,w.requestUpdatedAt])
        await client.query('update hashpaystream.agreements set status=$2,updated_at=$3 where agreement_id=$1',[w.agreementId,w.status,w.updatedAt])
        await client.query('update hashpaystream.agreement_projections set source_version=$2,source_hash=$3,projection=$4::jsonb,authoritative_observed_at=$5 where agreement_id=$1',[w.agreementId,w.sourceVersion,w.sourceHash,JSON.stringify(w.projection),w.updatedAt])
        result.updated++
      }
    } else result.inserted++
    // Reuse exact immutable participant, agreement, terms and binding comparisons before the outer commit.
    await persistReceiptWorkflows(client,{...plan,workflows:[w]})
    await history(w.agreementId,w.sourceVersion,w.sourceHash,w.projection)
  }
  return result
}
