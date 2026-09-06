import { createHash, createHmac } from 'node:crypto'

type Row = Record<string, any>
export type WorkflowSources = { accounts: Row; requests: Row[]; owners: Row[]; drafts: Row; attempts: Row[]; assessments: Row[]; observations: Row[]; secret: string }
export const projectionHash = (value: unknown): string => {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
const requireThat = (ok: unknown, code: string) => { if (!ok) throw new Error(code) }
const address = (x: unknown) => { requireThat(typeof x==='string' && /^0x[a-f0-9]{40}$/i.test(x),'WORKFLOW_ADDRESS_INVALID'); return String(x).toLowerCase() }
const units = (x: unknown) => { requireThat(typeof x==='string' && /^\d{1,78}$/.test(x),'WORKFLOW_AMOUNT_INVALID'); return BigInt(String(x)) }
const time = (x: unknown) => { requireThat(typeof x==='string' && Number.isFinite(Date.parse(x)),'WORKFLOW_TIMESTAMP_INVALID'); return new Date(String(x)).toISOString() }
const sum = (rows: Row[], event: string, field: string) => rows.filter(o=>o.payload.eventName===event).reduce((n,o)=>n+units(o.payload.eventAmounts[field]),0n)

// An offline, evidence-bound historical projection. No wallet balance or spend authority is inferred.
export function buildReceiptWorkflowPlan(s: WorkflowSources) {
  requireThat(s.secret.length>=32,'WORKFLOW_OWNERSHIP_SECRET_REQUIRED')
  requireThat(s.observations.length>0,'WORKFLOW_OBSERVATIONS_EMPTY')
  const h=(label:string,value:string)=>createHmac('sha256',s.secret).update(label+'\0'+value).digest('hex')
  const mapped=new Map<string,Row[]>(), seen=new Set<string>()
  for(const o of s.observations) {
    requireThat(o.observation_type==='confirmed' && !seen.has(o.observation_id),'WORKFLOW_OBSERVATION_INVALID'); seen.add(o.observation_id)
    const p=o.payload
    requireThat(projectionHash(p)===o.payload_hash,'WORKFLOW_PAYLOAD_HASH_CONFLICT')
    const candidates=p.identityField==='positionId'
      ? s.assessments.filter(a=>a.fundingRequest?.settlementVersion===3 && a.fundingRequest.fundingTerms?.message?.offerHash?.toLowerCase()===p.identity).map(a=>a.agreementId)
      : s.attempts.filter(a=>a.prepared?.agreementId?.toLowerCase()===p.identity).map(a=>a.agreementId)
    const ids=[...new Set(candidates)]
    requireThat(ids.length===1 && typeof ids[0]==='string','WORKFLOW_OBSERVATION_UNBOUND')
    const id=ids[0] as string; mapped.set(id,[...(mapped.get(id)||[]),o])
  }
  const workflows: Row[]=[]
  for(const [agreementId,observations] of mapped) {
    const requests=s.requests.filter(r=>r.agreementId===agreementId), owners=s.owners.filter(o=>o.agreementId===agreementId)
    requireThat(requests.length===1 && owners.length===1,'WORKFLOW_OWNERSHIP_AMBIGUOUS')
    const r=requests[0],owner=owners[0],d=s.drafts[agreementId]
    requireThat(owner.domain==='human'||owner.domain==='upfront','WORKFLOW_IDENTITY_DOMAIN_UNSUPPORTED')
    requireThat(/^[a-f0-9]{64}$/.test(r.customerAccountKey)&&/^[a-f0-9]{64}$/.test(r.providerAccountKey)&&r.customerAccountKey!==r.providerAccountKey,'WORKFLOW_PARTICIPANTS_INVALID')
    for(const key of [r.customerAccountKey,r.providerAccountKey]) { const a=s.accounts[key];requireThat(a&&a.accountKey===key&&h('hashpaystream.account',String(a.email).toLowerCase())===key,'WORKFLOW_ACCOUNT_HASH_CONFLICT') }
    const customer=s.accounts[r.customerAccountKey],provider=s.accounts[r.providerAccountKey]
    requireThat(owner.serviceRequestId===r.id && owner.ownerAccountKey===r.providerAccountKey && owner.ownerHash===h('hashpaystream.service-request-owner',r.providerAccountKey),'WORKFLOW_PROVIDER_OWNER_CONFLICT')
    requireThat(owner.payerHash===h('hashpaystream.payer',customer.email),'WORKFLOW_CUSTOMER_OWNER_CONFLICT')
    requireThat(r.providerAcceptedVersion===r.activeVersion&&r.customerAcceptedVersion===r.activeVersion&&r.terms?.length===r.activeVersion,'WORKFLOW_ACCEPTANCE_CONFLICT')
    requireThat(d?.id===agreementId&&d.resourceId===`request:${r.id}`&&String(d.payerEmail).toLowerCase()===customer.email.toLowerCase(),'WORKFLOW_DRAFT_REFERENCE_CONFLICT')
    const attempts=s.attempts.filter(a=>a.agreementId===agreementId&&a.partnerId===d.partnerId&&a.prepared&&a.escrow)
    requireThat(attempts.length===1,'WORKFLOW_ACTIVATION_AMBIGUOUS')
    const attempt=attempts[0],p=attempt.prepared,terms=r.terms[r.activeVersion-1],upfront=Boolean(terms.upfrontRequested)
    requireThat(owner.domain===(upfront?'upfront':'human'),'WORKFLOW_PRODUCT_CONFLICT')
    requireThat(p.chainId===5042002&&address(p.usdc)==='0x3600000000000000000000000000000000000000','WORKFLOW_NETWORK_CONFLICT')
    requireThat(units(p.totalAmount)===units(terms.amountUsdcUnits)&&terms.durationSeconds===d.durationSeconds&&terms.cancellationWindowSeconds===d.cancellationWindowSeconds,'WORKFLOW_TERMS_CONFLICT')
    requireThat(p.termsHash?.toLowerCase()===d.chainTerms?.termsHash?.toLowerCase()&&address(p.recipient)===address(d.recipient),'WORKFLOW_CHAIN_TERMS_CONFLICT')
    requireThat(address(p.payer)===address(customer.walletAddress),'WORKFLOW_PAYER_WALLET_CONFLICT')
    if(!upfront)requireThat(address(p.recipient)===address(provider.walletAddress),'WORKFLOW_PROVIDER_WALLET_CONFLICT')
    const arc=observations.filter(o=>o.payload.identityField==='agreementId')
    requireThat(arc.every(o=>o.network==='arc-testnet'&&address(o.contract_address)===address(attempt.escrow)),'WORKFLOW_ESCROW_CONFLICT')
    requireThat(arc.filter(o=>o.payload.eventName==='AgreementActivated').length===1&&sum(arc,'AgreementActivated','amount')===units(p.totalAmount),'WORKFLOW_ACTIVATION_CONFLICT')
    const released=sum(arc,'StepReleased','amount'),refunded=sum(arc,'AgreementRefunded','refundedAmount'),total=units(p.totalAmount)
    requireThat(released+refunded<=total,'WORKFLOW_RECEIPT_TOTAL_CONFLICT')
    const remaining=total-released-refunded
    const status=refunded>0n?'refunded':released===total?'completed':attempt.lifecycle?.status
    requireThat(['active','expired','completed','refunded'].includes(status),'WORKFLOW_STATE_UNSUPPORTED')
    requireThat(!['completed','refunded'].includes(status)||remaining===0n,'WORKFLOW_TERMINAL_BALANCE_CONFLICT')
    const positions=s.assessments.filter(a=>a.agreementId===agreementId&&a.fundingRequest?.settlementVersion===3)
    for(const o of observations.filter(o=>o.payload.identityField==='positionId')) {
      const matches=positions.filter(a=>a.fundingRequest.fundingTerms.message.offerHash.toLowerCase()===o.payload.identity)
      requireThat(matches.length===1&&address(matches[0].fundingRequest.fundingTerms.message.providerArcRecipient)===address(provider.walletAddress),'WORKFLOW_POSITION_PROVIDER_CONFLICT')
    }
    const versions=r.terms.map((t:Row,i:number)=>{requireThat(t.version===i+1,'WORKFLOW_VERSION_GAP');const clean={version:t.version,proposedBy:t.proposedBy,amountUsdcUnits:units(t.amountUsdcUnits).toString(),durationSeconds:t.durationSeconds,cancellationWindowSeconds:t.cancellationWindowSeconds,upfrontRequested:Boolean(t.upfrontRequested)};return {...clean,termsHash:projectionHash(clean),createdAt:time(t.createdAt)}})
    const sourceVersion=arc.reduce((n,o)=>BigInt(o.block_number)>n?BigInt(o.block_number):n,0n).toString()
    const projection={schema:1,agreementId,requestId:r.id,identityDomain:'human',status,product:upfront?'upfront':'direct',protectedUsdcUnits:total.toString(),releasedUsdcUnits:released.toString(),refundedUsdcUnits:refunded.toString(),remainingUsdcUnits:remaining.toString(),escrowAddress:address(attempt.escrow),onchainAgreementId:p.agreementId.toLowerCase(),observationIds:observations.map(o=>o.observation_id).sort(),walletEvidence:'legacy_authenticated_account_binding',availableBalance:null}
    const row={agreementId,requestId:r.id,customerReference:r.customerAccountKey,providerReference:r.providerAccountKey,identityDomain:'human',status,requestStatus:status==='active'?'funded':status,product:projection.product,projectReference:d.partnerId,network:'arc-testnet',chainId:5042002,assetAddress:address(p.usdc),protectedAmountUnits:total.toString(),acceptedTermsHash:p.termsHash.slice(2).toLowerCase(),createdAt:time(d.createdAt),updatedAt:observations.map(o=>time(o.occurred_at)).sort().at(-1)!,requestCreatedAt:time(r.createdAt),requestUpdatedAt:time(r.updatedAt),versions,sourceVersion,projection}
    workflows.push({...row,sourceHash:projectionHash(row)})
  }
  const excluded=s.requests.filter(r=>!mapped.has(r.agreementId))
  requireThat(excluded.every(r=>!r.agreementId || (r.status==='awaiting_funding'&&s.drafts[r.agreementId]?.status==='draft')),'WORKFLOW_UNEXPLAINED_EXCLUSION')
  return {workflows:workflows.sort((a,b)=>a.agreementId.localeCompare(b.agreementId)),observationCount:seen.size,excludedWithoutReceipts:excluded.length,agentWorkflows:0}
}
