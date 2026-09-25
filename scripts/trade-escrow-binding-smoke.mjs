import assert from 'node:assert/strict'
import {prepareTradeEscrowBinding} from '../api/trade-escrow-binding.ts'
const terms={price:'10.25',deliveryFee:'1.50',currency:'USDC',handover:'Delivery',location:'Test area',dispatchDays:3,deliveryDays:7,inspectionHours:48,escrowPolicyVersion:'trade-escrow-v1',returns:'Seller pays return delivery for undisclosed damage.',carrier:'Synthetic carrier'}
const input={offer:{id:'11111111-1111-4111-8111-111111111111',status:'accepted',listingRevision:1,terms,snapshot:{title:'Shirt',description:'Disclosed wear',photos:['data:image/jpeg;base64,synthetic']}},chainId:5042002,factory:'0x1111111111111111111111111111111111111111',buyer:'0x2222222222222222222222222222222222222222',seller:'0x3333333333333333333333333333333333333333',arbiter:'0x4444444444444444444444444444444444444444',now:1800000000,fundBy:1800086400}
const result=prepareTradeEscrowBinding(input)
assert.equal(result.contractTerms.amount,11750000n);assert.equal(result.fundingEnabled,false)
const tokenAddress='0x9999999999999999999999999999999999999999'
const tokenTerms={...terms,currency:'XLAYER_ASSET',settlementAsset:'XLAYER_TOKENIZED_ASSET',settlementToken:tokenAddress}
const tokenInput={...input,chainId:196,offer:{...input.offer,terms:tokenTerms},env:{HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON:JSON.stringify([{address:tokenAddress,decimals:18},{address:'0x8888888888888888888888888888888888888888',decimals:18}])}}
const tokenResult=prepareTradeEscrowBinding(tokenInput)
assert.equal(tokenResult.contractTerms.amount,11750000000000000000n)
assert.equal(tokenResult.contractTerms.token,tokenAddress)
assert.equal(tokenResult.contractTerms.settlementAsset,'XLAYER_TOKENIZED_ASSET')
assert.equal(tokenResult.contractTerms.decimals,18)
assert.equal(tokenResult.fundingEnabled,false)
assert.throws(()=>prepareTradeEscrowBinding({...tokenInput,offer:{...tokenInput.offer,terms:{...tokenTerms,settlementToken:'0x7777777777777777777777777777777777777777'}}}))
assert.throws(()=>prepareTradeEscrowBinding({...tokenInput,chainId:5042002}))
assert.throws(()=>prepareTradeEscrowBinding({...tokenInput,env:{HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON:JSON.stringify([{address:tokenAddress,decimals:1}])}}))
assert.equal(prepareTradeEscrowBinding({...input,offer:{...input.offer,terms:Object.fromEntries(Object.entries(terms).reverse())}}).termsHash,result.termsHash)
for(const patch of [{buyer:input.seller},{chainId:1},{fundBy:input.now},{fundBy:input.now+8*86400}])assert.throws(()=>prepareTradeEscrowBinding({...input,...patch}))
for(const patch of [{status:'proposed'},{terms:{...terms,currency:'NGN'}},{terms:{...terms,escrowPolicyVersion:undefined}},{snapshot:{title:'Missing frozen photos'}}])assert.throws(()=>prepareTradeEscrowBinding({...input,offer:{...input.offer,...patch}}))
for(const altered of [ {...input,chainId:196}, {...input,fundBy:input.fundBy+1}, {...input,arbiter:'0x5555555555555555555555555555555555555555'}, {...input,offer:{...input.offer,snapshot:{...input.offer.snapshot,description:'Changed defect'}}}, {...input,offer:{...input.offer,terms:{...terms,price:'10.26'}}} ])assert.notEqual(prepareTradeEscrowBinding(altered).termsHash,result.termsHash)
console.log('Trade binding passed: Arc USDC and X Layer tokenized-asset profiles, exact units, canonical terms, complete snapshot, participant/network binding, deadline and legacy/fiat rejection. No funding authorized.')

const smallTerms={...tokenTerms,price:'0.00223',deliveryFee:'0',handover:'Pickup'}
assert.equal(prepareTradeEscrowBinding({...tokenInput,offer:{...tokenInput.offer,terms:smallTerms}}).contractTerms.amount,2230000000000000n)
assert.throws(()=>prepareTradeEscrowBinding({...tokenInput,offer:{...tokenInput.offer,terms:{...smallTerms,price:'0.0000001'}},env:{HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON:JSON.stringify([{address:tokenAddress,decimals:6}])}}))
