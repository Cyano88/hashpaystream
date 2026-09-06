import assert from 'node:assert/strict'
import {filterTradeListings,sampleTradeListings,validateTradeDraft} from '../src/lib/tradePreview.ts'
assert.equal(filterTradeListings(sampleTradeListings,' trainers ','All','LAGOS').length,1)
assert.equal(filterTradeListings(sampleTradeListings,'trainers','All','Abuja').length,0)
assert.equal(filterTradeListings(sampleTradeListings,'','Clothing','').length,3)
const draft={...sampleTradeListings[0],photos:['data:image/jpeg;base64,synthetic']}
assert.equal(validateTradeDraft(draft),'')
for(const price of ['0','-1','1e3','NaN','1.123','9999999999']) assert.notEqual(validateTradeDraft({...draft,price}),'')
assert.notEqual(validateTradeDraft({...draft,photos:[]}),'')
assert.notEqual(validateTradeDraft({...draft,photos:['https://example.com/photo.jpg']}),'')
assert.notEqual(validateTradeDraft({...draft,description:'short'}),'')
console.log('Trade search, location/category filtering and draft validation passed.')
