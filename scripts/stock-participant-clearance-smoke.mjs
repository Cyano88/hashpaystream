import assert from 'node:assert/strict'
import {assertStockParticipantClearance as check} from '../api/stock-participant-clearance.ts'
const a=n=>'0x'+String(n).repeat(40)
const expected={chainId:196,asset:a(1),worker:a(2),funder:a(3),earningsId:'0x'+'11'.repeat(32),principalUsdcUnits:'100000000',policyVersion:'2'}
const now=1000
const valid={...expected,checkedAt:990,expiresAt:1030,workerEligible:true,funderEligible:true,workerJurisdiction:'NG',funderJurisdiction:'SG',reviewReference:'synthetic-review-only'}
assert.equal(check(valid,expected,now,60),valid)
for(const patch of [
 {chainId:31337},{asset:a(4)},{worker:a(4)},{funder:a(4)},{earningsId:'0x'+'22'.repeat(32)},
 {principalUsdcUnits:'99000000'},{policyVersion:'1'},{workerEligible:false},{funderEligible:false},
 {checkedAt:1001},{checkedAt:900},{expiresAt:1000},{expiresAt:1100},{reviewReference:''},
 {workerJurisdiction:''},{funderJurisdiction:'global'}
])assert.throws(()=>check({...valid,...patch},expected,now,60))
assert.throws(()=>check(undefined,expected,now,60))
assert.throws(()=>check({issuerEligible:true},expected,now,60))
console.log('Participant clearance passed: exact pair/request/policy binding, expiry, denied decisions, review metadata, and rejection of asset-only approval.')
