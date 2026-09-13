import assert from 'node:assert/strict'
import {assertStockDexHistory as guard} from '../api/stock-dex-history.ts'
const history=(long,short)=>[0n,BigInt(long)*1800n-BigInt(short)*300n,BigInt(long)*1800n]
assert.deepEqual(guard(-210000,history(-210000,-210000),50),{spotTick:-210000,meanTick5m:-210000,meanTick30m:-210000})
assert.doesNotThrow(()=>guard(49,history(0,0),50));assert.throws(()=>guard(50,history(0,0),50),/disagree/)
for(const [spot,long,short] of [[100,0,0],[-100,0,0],[100,0,100],[0,100,0],[0,0,100]])assert.throws(()=>guard(spot,history(long,short),50),/disagree/)
assert.equal(guard(-1,[0n,0n,-1n],50).meanTick30m,-1)
const start=(1n<<55n)-100n;const wrapped=[start,BigInt.asIntN(56,start+1500n),BigInt.asIntN(56,start+1800n)];assert.equal(guard(1,wrapped,0).meanTick30m,1)
for(const args of [[0,[],50],[0,[0n,1n],50],[NaN,history(0,0),50],[887273,history(0,0),50],[0,history(0,0),-1],[0,[0n,0n,1n<<55n],50],[0,history(887273,887273),50]])assert.throws(()=>guard(...args))
assert.throws(()=>guard(887272,history(-887272,-887272),10000),/disagree/)
console.log('DEX history guards passed: upward/downward spot shocks, shifted short history, sustained divergence, exact ratio boundary, negative rounding, int56 wrap and malformed data.')
