import type { SqlClient } from './financial-core.js'
import { projectionHash, type buildReceiptWorkflowPlan } from './receipt-workflow-projection.js'
type Plan = ReturnType<typeof buildReceiptWorkflowPlan>

// Caller owns the transaction. Historical backfill only; changed snapshots require a separate reconciled update path.
export async function persistReceiptWorkflows(client: SqlClient, plan: Plan) {
  let inserted=0,duplicate=0
  for(const w of plan.workflows) {
    await client.query(`insert into hashpaystream.service_requests (request_id,identity_domain,customer_reference,provider_reference,status,current_version,agreement_id,created_at,updated_at)
      values ($1,'human',$2,$3,$4,$5,$6,$7,$8) on conflict (request_id) do nothing`,[w.requestId,w.customerReference,w.providerReference,w.requestStatus,w.versions.length,w.agreementId,w.requestCreatedAt,w.requestUpdatedAt])
    const request=(await client.query<any>('select * from hashpaystream.service_requests where request_id=$1',[w.requestId])).rows[0]
    if(!request||request.identity_domain!==w.identityDomain||request.customer_reference!==w.customerReference||request.provider_reference!==w.providerReference||request.agreement_id!==w.agreementId||request.status!==w.requestStatus||request.current_version!==w.versions.length||new Date(request.created_at).toISOString()!==w.requestCreatedAt||new Date(request.updated_at).toISOString()!==w.requestUpdatedAt)throw Error('WORKFLOW_REQUEST_CONFLICT')
    for(const v of w.versions) {
      await client.query(`insert into hashpaystream.service_request_versions (request_id,version,proposed_by,terms_hash,amount_units,duration_seconds,cancellation_window_seconds,early_pay_requested,terms,created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) on conflict (request_id,version) do nothing`,[w.requestId,v.version,v.proposedBy,v.termsHash,v.amountUsdcUnits,v.durationSeconds,v.cancellationWindowSeconds,v.upfrontRequested,JSON.stringify(v),v.createdAt])
      const stored=(await client.query<any>('select * from hashpaystream.service_request_versions where request_id=$1 and version=$2',[w.requestId,v.version])).rows[0]
      if(!stored||projectionHash(stored.terms)!==projectionHash(v)||stored.terms_hash!==v.termsHash||String(stored.amount_units)!==v.amountUsdcUnits||stored.proposed_by!==v.proposedBy||stored.duration_seconds!==v.durationSeconds||stored.cancellation_window_seconds!==v.cancellationWindowSeconds||stored.early_pay_requested!==v.upfrontRequested||new Date(stored.created_at).toISOString()!==v.createdAt)throw Error('WORKFLOW_TERMS_REPLAY_CONFLICT')
    }
    await client.query(`insert into hashpaystream.agreements (agreement_id,identity_domain,request_id,checkout_mode,agreement_product,project_reference,network,chain_id,asset_address,protected_amount_units,accepted_terms_hash,status,created_at,updated_at)
      values ($1,'human',$2,'human',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (agreement_id) do nothing`,[w.agreementId,w.requestId,w.product,w.projectReference,w.network,w.chainId,w.assetAddress,w.protectedAmountUnits,w.acceptedTermsHash,w.status,w.createdAt,w.updatedAt])
    const a=(await client.query<any>('select * from hashpaystream.agreements where agreement_id=$1',[w.agreementId])).rows[0]
    if(!a||a.request_id!==w.requestId||a.identity_domain!=='human'||a.agreement_product!==w.product||a.project_reference!==w.projectReference||a.network!==w.network||String(a.chain_id)!==String(w.chainId)||a.asset_address!==w.assetAddress||String(a.protected_amount_units)!==w.protectedAmountUnits||a.accepted_terms_hash!==w.acceptedTermsHash||a.status!==w.status||a.checkout_mode!=='human'||new Date(a.created_at).toISOString()!==w.createdAt||new Date(a.updated_at).toISOString()!==w.updatedAt)throw Error('WORKFLOW_AGREEMENT_CONFLICT')
    const result=await client.query(`insert into hashpaystream.agreement_projections (agreement_id,source_version,source_hash,projection,authoritative_observed_at)
      values ($1,$2,$3,$4::jsonb,$5) on conflict (agreement_id) do nothing returning agreement_id`,[w.agreementId,w.sourceVersion,w.sourceHash,JSON.stringify(w.projection),w.updatedAt])
    if(result.rowCount)inserted++;else duplicate++
    const p=(await client.query<any>('select source_version::text,source_hash,projection,authoritative_observed_at from hashpaystream.agreement_projections where agreement_id=$1',[w.agreementId])).rows[0]
    if(!p||p.source_version!==w.sourceVersion||p.source_hash!==w.sourceHash||projectionHash(p.projection)!==projectionHash(w.projection)||new Date(p.authoritative_observed_at).toISOString()!==w.updatedAt)throw Error('WORKFLOW_PROJECTION_REPLAY_CONFLICT')
    for(const observationId of w.projection.observationIds) {
      await client.query('insert into hashpaystream.agreement_receipt_bindings (observation_id,agreement_id) values ($1,$2) on conflict (observation_id) do nothing',[observationId,w.agreementId])
      const binding=(await client.query<any>('select agreement_id from hashpaystream.agreement_receipt_bindings where observation_id=$1',[observationId])).rows[0]
      if(binding?.agreement_id!==w.agreementId)throw Error('WORKFLOW_RECEIPT_BINDING_CONFLICT')
    }
  }
  return {inserted,duplicate}
}

// Internal staging read adapter: principal must come from server-verified authentication, never query/body ownership fields.
export async function readStagingReceiptWorkflow(client: SqlClient, principal: {identityDomain:'human'|'agent';accountReference:string}, agreementId:string) {
  const database=(await client.query<{name:string}>('select current_database() as name')).rows[0]?.name
  if(!/(?:^|[_-])stag(?:ing)?(?:$|[_-])/.test(database||''))throw Error('STAGING_WORKFLOW_READ_REQUIRED')
  if(principal.identityDomain!=='human'||!/^[a-f0-9]{64}$/.test(principal.accountReference))return null
  const result=await client.query<any>(`select p.projection,r.customer_reference,r.provider_reference from hashpaystream.agreement_projections p
    join hashpaystream.agreements a using(agreement_id) join hashpaystream.service_requests r on r.request_id=a.request_id and r.identity_domain=a.identity_domain
    where a.agreement_id=$1 and a.identity_domain=$2 and (r.customer_reference=$3 or r.provider_reference=$3)`,[agreementId,principal.identityDomain,principal.accountReference])
  if(!result.rows[0])return null
  const row=result.rows[0]
  const evidence=await client.query<any>(`select o.observation_id,o.network,o.transaction_hash,o.event_name,o.payload,p.posting_id
    from hashpaystream.agreement_receipt_bindings b join hashpaystream.chain_observations o using(observation_id)
    join hashpaystream.ledger_transactions p on p.reference_type='chain_observation' and p.reference_id=o.observation_id and p.status='posted'
    where b.agreement_id=$1 and o.observation_type='confirmed' and not exists (select 1 from hashpaystream.chain_observations conflict where conflict.network=o.network and conflict.chain_id=o.chain_id and conflict.transaction_hash=o.transaction_hash and conflict.log_index=o.log_index and (conflict.observation_type='reorged' or conflict.block_hash<>o.block_hash)) order by o.network,o.block_number,o.transaction_hash,o.log_index`,[agreementId])
  const ids=evidence.rows.map(o=>o.observation_id).sort()
  if(projectionHash(ids)!==projectionHash(row.projection.observationIds))throw Error('WORKFLOW_READ_EVIDENCE_INCOMPLETE')
  return {role:row.customer_reference===principal.accountReference?'customer':'provider',projection:row.projection,receipts:evidence.rows.map(o=>({observationId:o.observation_id,network:o.network,transactionHash:o.transaction_hash,eventName:o.event_name,postingId:o.posting_id,transfers:o.payload.transfers})),availableBalance:null}
}
