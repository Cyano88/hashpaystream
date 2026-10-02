import assert from 'node:assert/strict'
import {tradePayment,ARC_TRADE_USDC} from '../src/lib/tradePayment.ts'
import {tradeTotal,validateTradeTerms} from '../src/lib/tradeAgreement.ts'
const base={price:'0.000001',deliveryFee:'0',currency:'USDC',paymentRail:'arc',handover:'Pickup',location:'Fixture location',dispatchDays:1,deliveryDays:2,escrowPolicyVersion:'trade-escrow-v1',inspectionHours:24,returns:'Return if materially different.',carrier:'',settlementAsset:'USDC'}
const terms=validateTradeTerms(base)
assert.equal(tradeTotal(terms),'0.000001')
assert.deepEqual(tradePayment(terms),{rail:'arc',chainId:5042,token:ARC_TRADE_USDC,decimals:6,policy:'trade-arc-usdc-v1'})
assert.equal(tradeTotal(validateTradeTerms({...base,price:'0.999999',deliveryFee:'0.000001',handover:'Delivery',carrier:'Fixture carrier'})),'1.000000')
for(const patch of [{paymentRail:'testnet'},{paymentRail:'xlayer'},{currency:'USD'},{currency:'XLAYER_ASSET',settlementAsset:'XLAYER_TOKENIZED_ASSET',settlementToken:'0x'+'11'.repeat(20)},{settlementToken:'0x'+'11'.repeat(20)},{price:'0.0000001'}])assert.throws(()=>validateTradeTerms({...base,...patch}))
const legacy={...base,price:'1.00',paymentRail:undefined}
const original=validateTradeTerms(legacy)
assert.equal(Object.hasOwn(original,'paymentRail'),false)
assert.equal(tradeTotal(original),'1.00')
assert.throws(()=>tradePayment(original),/explicit payment network/)
const stock={...base,paymentRail:'xlayer',currency:'XLAYER_ASSET',settlementAsset:'XLAYER_TOKENIZED_ASSET',settlementToken:'0x'+'11'.repeat(20),price:'0.000000000000000001'}
assert.equal(tradePayment(validateTradeTerms(stock)).chainId,196)
assert.equal(tradePayment(validateTradeTerms({...stock,paymentRail:undefined})).chainId,196)
assert.throws(()=>tradePayment({...stock,settlementToken:'0x'+'00'.repeat(20)}))
console.log('Trade payment rails passed: explicit Arc mainnet consent, exact USDC units, legacy preservation, stock compatibility and cross-rail rejection.')
