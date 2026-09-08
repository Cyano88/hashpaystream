import assert from 'node:assert/strict'
import { refundEligibility } from '../src/lib/upfrontRefund.ts'
const funder='0x0000000000000000000000000000000000000001'
const other='0x0000000000000000000000000000000000000002'
const position=Array(16).fill('0');position[0]=funder;position[14]=1000;position[15]=1
assert.equal(refundEligibility(position,funder,999n).ready,false)
assert.equal(refundEligibility(position,funder,1000n).ready,false)
assert.equal(refundEligibility(position,funder,1001n).ready,true)
assert.equal(refundEligibility(position,other,1001n).ready,false)
for(const status of [0,2,3]){position[15]=status;assert.equal(refundEligibility(position,funder,1001n).ready,false)}
console.log('Refund boundary, original-funder, released and replay guards passed.')
