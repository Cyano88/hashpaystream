import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { buildReceiptWorkflowPlan,projectionHash } from '../api/receipt-workflow-projection.ts'
const secret='synthetic-ownership-secret-'.repeat(3), h=(l,v)=>createHmac('sha256',secret).update(l+'\0'+v).digest('hex')
const address=n=>'0x'+n.repeat(40),payer=address('1'),provider=address('2'),escrow=address('3'),token='0x3600000000000000000000000000000000000000',identity='0x'+'4'.repeat(64),termsHash='0x'+'5'.repeat(64)
const customerEmail='customer@example.test',providerEmail='provider@example.test',customerKey=h('hashpaystream.account',customerEmail),providerKey=h('hashpaystream.account',providerEmail),date='2026-09-06T00:00:00.000Z',agreementId='agr_synthetic12345'
const terms={version:1,proposedBy:'customer',amountUsdcUnits:'500000000',durationSeconds:86400,cancellationWindowSeconds:900,upfrontRequested:false,createdAt:date}
const observation=(event,amount,id)=>{const payload={identityField:'agreementId',identity,eventName:event,eventAmounts:{amount},network:'arc-testnet',transfers:[]};return {observation_id:id,observation_type:'confirmed',occurred_at:date,network:'arc-testnet',contract_address:escrow,block_number:event==='AgreementActivated'?'100':'200',payload,payload_hash:projectionHash(payload)}}
const source={secret,accounts:{[customerKey]:{accountKey:customerKey,email:customerEmail,walletAddress:payer},[providerKey]:{accountKey:providerKey,email:providerEmail,walletAddress:provider}},requests:[{id:'request_synthetic',agreementId,customerAccountKey:customerKey,providerAccountKey:providerKey,providerAcceptedVersion:1,customerAcceptedVersion:1,activeVersion:1,terms:[terms],createdAt:date,updatedAt:date}],owners:[{agreementId,domain:'human',serviceRequestId:'request_synthetic',ownerAccountKey:providerKey,ownerHash:h('hashpaystream.service-request-owner',providerKey),payerHash:h('hashpaystream.payer',customerEmail)}],drafts:{[agreementId]:{id:agreementId,resourceId:'request:request_synthetic',payerEmail:customerEmail,partnerId:'partner_synthetic',durationSeconds:86400,cancellationWindowSeconds:900,recipient:provider,chainTerms:{termsHash},createdAt:date}},attempts:[{agreementId,partnerId:'partner_synthetic',escrow,prepared:{agreementId:identity,chainId:5042002,usdc:token,payer,recipient:provider,totalAmount:'500000000',termsHash},lifecycle:{status:'completed'},updatedAt:date}],assessments:[],observations:[observation('AgreementActivated','500000000','obs_synthetic_1'),observation('StepReleased','500000000','obs_synthetic_2')]}
const plan=buildReceiptWorkflowPlan(source)
assert.equal(plan.workflows.length,1);assert.equal(plan.observationCount,2)
assert.equal(plan.workflows[0].projection.remainingUsdcUnits,'0')
assert.equal(plan.workflows[0].projection.status,'completed')
assert.equal(plan.workflows[0].projection.availableBalance,null)
assert.doesNotMatch(JSON.stringify(plan),/example\.test|synthetic-ownership-secret/)
assert.deepEqual(buildReceiptWorkflowPlan(structuredClone(source)),plan)
const refreshed=structuredClone(source);refreshed.attempts[0].updatedAt='2026-09-07T00:00:00.000Z';assert.deepEqual(buildReceiptWorkflowPlan(refreshed),plan)
for(const [mutate,code]of [
 [s=>s.owners[0].ownerHash='0'.repeat(64),'PROVIDER_OWNER_CONFLICT'],
 [s=>s.owners[0].payerHash='0'.repeat(64),'CUSTOMER_OWNER_CONFLICT'],
 [s=>s.accounts[customerKey].email=providerEmail,'ACCOUNT_HASH_CONFLICT'],
 [s=>s.accounts[customerKey].walletAddress=provider,'PAYER_WALLET_CONFLICT'],
 [s=>s.requests[0].providerAcceptedVersion=0,'ACCEPTANCE_CONFLICT'],
 [s=>s.requests[0].terms[0].amountUsdcUnits='1','TERMS_CONFLICT'],
 [s=>s.observations[0].payload.identity='0x'+'6'.repeat(64),'PAYLOAD_HASH_CONFLICT'],
 [s=>{s.observations[0].payload.identity='0x'+'6'.repeat(64);s.observations[0].payload_hash=projectionHash(s.observations[0].payload)},'OBSERVATION_UNBOUND'],
 [s=>s.owners[0].domain='agent','IDENTITY_DOMAIN_UNSUPPORTED'],
 [s=>s.observations.push(s.observations[0]),'OBSERVATION_INVALID'],
 [s=>s.requests.push({...s.requests[0],id:'other_request'}),'OWNERSHIP_AMBIGUOUS'],
]){const changed=structuredClone(source);mutate(changed);assert.throws(()=>buildReceiptWorkflowPlan(changed),new RegExp(code))}
console.log('Receipt workflow participant, HMAC, wallet binding, accepted terms, privacy, duplicate and fail-closed checks passed.')
