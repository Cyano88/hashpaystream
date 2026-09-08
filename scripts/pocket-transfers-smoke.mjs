import assert from 'node:assert/strict'
import {createPocketTransfersHandler,reconcilePocketTransfers,availablePocketUnits} from '../api/pocket-transfers.ts'
let store, actor='owner@example.com', inspections=0
const owner='0x1111111111111111111111111111111111111111', recipient='0x2222222222222222222222222222222222222222'
let tail=Promise.resolve()
const deps={identity:async()=>({email:actor,emails:[actor],wallets:[owner]}),circleWallets:async()=>[{id:'wallet',address:owner}],balance:async()=>1000000n,read:async()=>structuredClone(store),mutate:fn=>{const op=tail.then(async()=>{const next=await fn(structuredClone(store));store=next;return next});tail=op.catch(()=>{});return op},inspect:async row=>{inspections++;return row.hash==='0x'+'a'.repeat(64)?{status:'successful'}:{}},recordActivity:async()=>true}
const handler=createPocketTransfersHandler(deps)
async function call(body,method='POST'){const res={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method,body},res);return res}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const create=(n,units='400000')=>({action:'create',id:id(n),chainId:196,owner,recipient,units})
assert.equal((await call(create(1))).code,200)
assert.equal((await call(create(1))).code,200)
assert.equal(store.records.length,1,'Lost create response retries the same intent')
assert.equal((await call({...create(1),units:'1'})).code,409,'Intent cannot change on retry')
assert.equal((await call({action:'track',id:id(1),hash:'0x'+'b'.repeat(64),accepted:true})).code,200)
assert.equal((await call(create(2))).code,200,'Independent send allowed while first pending')
assert.equal((await call(create(3))).code,409,'Pending amounts reserve spending')
assert.equal(availablePocketUnits(store.records,196,owner,1000000n),200000n)
actor='other@example.com'
assert.deepEqual((await call(undefined,'GET')).body.transfers,[])
assert.equal((await call({action:'track',id:id(1),hash:'0x'+'c'.repeat(64)})).code,404)
actor='owner@example.com'
assert.equal((await call({action:'track',id:id(2),hash:'0x'+'b'.repeat(64)})).code,409,'A hash cannot settle two payments')
assert.equal((await call({action:'track',id:id(2),hash:'0x'+'a'.repeat(64),status:'successful'})).body.transfer.status,'processing','Client cannot assert success')
await reconcilePocketTransfers(deps)
assert.equal(store.records[0].status,'processing')
assert.equal(store.records[1].status,'successful')
assert.equal((await call(create(3))).code,200,'Verified completion releases only its own hold')
assert.equal(inspections,2)
// A worker restart recovers the same durable rows; timeout never changes outcome.
await reconcilePocketTransfers({...deps,inspect:async()=>{throw Error('RPC timeout')}})
assert.equal(store.records[0].status,'processing')
store=undefined
const results=await Promise.all([call(create(4,'600000')),call(create(5,'600000'))])
assert.deepEqual(results.map(item=>item.code).sort(),[200,409],'Concurrent reservation checks are atomic')
console.log('Durable Pocket intents, independent pending sends, atomic reservations, account isolation, exact hash ownership and worker restart checks passed.')

// A delayed worker pass cannot overwrite another worker's final result.
store={records:[{id:id(9),actor:'actor',chainId:196,owner,recipient,units:'1',hash:'0x'+'d'.repeat(64),status:'processing',updatedAt:'2026-09-08'}]}
await reconcilePocketTransfers({...deps,inspect:async()=>{store.records[0].status='successful';return {status:'processing'}}})
assert.equal(store.records[0].status,'successful')
console.log('Overlapping worker results cannot downgrade verified success.')
