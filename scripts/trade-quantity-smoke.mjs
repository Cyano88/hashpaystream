import assert from 'node:assert/strict'
import {tradeUnits,tradeTotal,validateTradeTerms} from '../src/lib/tradeAgreement.ts'
const base={price:'0.00223',deliveryFee:'0',currency:'XLAYER_ASSET',handover:'Pickup',location:'Test only',dispatchDays:1,deliveryDays:1,escrowPolicyVersion:'trade-escrow-v1',inspectionHours:24,returns:'Test listing without physical delivery.',carrier:'',settlementAsset:'XLAYER_TOKENIZED_ASSET',settlementToken:'0x'+'11'.repeat(20)}
assert.equal(tradeTotal(validateTradeTerms(base)),'0.00223')
assert.equal(tradeTotal({...base,price:'0.00999',deliveryFee:'0.00001'}),'0.01000')
assert.equal(tradeTotal({...base,price:'1.00',deliveryFee:'0.25'}),'1.25')
assert.equal(tradeUnits('0.000000000000000001',18),1n)
assert.equal(tradeUnits('10.25'),1025n)
for(const price of ['0.0000000000000000001','1e-3','-0.001','NaN','1.','9999999999']) assert.throws(()=>validateTradeTerms({...base,price}))
assert.throws(()=>validateTradeTerms({...base,deliveryFee:'0.00001'}))
for(const currency of ['USD','USDC','NGN']) assert.throws(()=>validateTradeTerms({...base,currency,settlementAsset:'USDC',price:'0.001'}))
assert.throws(()=>tradeUnits('0.0000001',6))
console.log('Trade quantities passed: fractional stocks, exact carry, legacy totals, fiat precision and excess precision rejection.')
