import assert from 'node:assert/strict'
import {prepareTradeEscrowBinding} from '../api/trade-escrow-binding.ts'
const terms={price:'10.25',deliveryFee:'1.50',currency:'USDC',handover:'Delivery',location:'Test area',dispatchDays:3,deliveryDays:7,inspectionHours:48,escrowPolicyVersion:'trade-escrow-v1',returns:'Seller pays return delivery for undisclosed damage.',carrier:'Synthetic carrier'}
const input={offer:{id:'11111111-1111-4111-8111-111111111111',status:'accepted',listingRevision:1,terms,snapshot:{title:'Shirt',description:'Disclosed wear',photos:['data:image/jpeg;base64,synthetic']}},chainId:5042002,factory:'0x1111111111111111111111111111111111111111',buyer:'0x2222222222222222222222222222222222222222',seller:'0x3333333333333333333333333333333333333333',arbiter:'0x4444444444444444444444444444444444444444',now:1800000000,fundBy:1800086400}
const result=prepareTradeEscrowBinding(input)
assert.equal(result.contractTerms.amount,11750000n);assert.equal(result.fundingEnabled,false)
assert.equal(prepareTradeEscrowBinding({...input,offer:{...input.offer,terms:Object.fromEntries(Object.entries(terms).reverse())}}).termsHash,result.termsHash)
for(const patch of [{buyer:input.seller},{chainId:1},{fundBy:input.now},{fundBy:input.now+8*86400}])assert.throws(()=>prepareTradeEscrowBinding({...input,...patch}))
for(const patch of [{status:'proposed'},{terms:{...terms,currency:'NGN'}},{terms:{...terms,escrowPolicyVersion:undefined}},{snapshot:{title:'Missing frozen photos'}}])assert.throws(()=>prepareTradeEscrowBinding({...input,offer:{...input.offer,...patch}}))
for(const altered of [ {...input,chainId:196}, {...input,fundBy:input.fundBy+1}, {...input,arbiter:'0x5555555555555555555555555555555555555555'}, {...input,offer:{...input.offer,snapshot:{...input.offer.snapshot,description:'Changed defect'}}}, {...input,offer:{...input.offer,terms:{...terms,price:'10.26'}}} ])assert.notEqual(prepareTradeEscrowBinding(altered).termsHash,result.termsHash)
console.log('Trade binding passed: exact units, canonical terms, complete snapshot, participant/network binding, deadline and legacy/fiat rejection. No funding authorized.')
