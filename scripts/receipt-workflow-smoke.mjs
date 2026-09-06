import assert from 'node:assert/strict'
import { buildReceiptWorkflowPlan,projectionHash } from '../api/receipt-workflow-projection.ts'
import { source,customerKey,providerEmail,provider } from './receipt-workflow-fixture.mjs'
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
