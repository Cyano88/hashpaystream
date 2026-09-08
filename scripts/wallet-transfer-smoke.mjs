import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi,parseAbiParameters} from 'viem'
import {verifyTransfer,withPaymentSubmission} from '../src/lib/walletTransfer.ts'
const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},setTimeout:(fn)=>{fn();return 1}}
const scope={chainId:196,owner:'0x1111111111111111111111111111111111111111',asset:'0x2222222222222222222222222222222222222222'},intent={recipient:'0x3333333333333333333333333333333333333333',units:'100000'}
const hash='0x'+'a'.repeat(64)
const log={address:scope.asset,topics:encodeEventTopics({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),eventName:'Transfer',args:{from:scope.owner,to:intent.recipient}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[100000n])}
const receipt={transactionHash:hash,status:'success',logs:[log]}
verifyTransfer(scope,intent,hash,receipt)
for(const bad of [{...receipt,status:'reverted'},{...receipt,logs:[]},{...receipt,logs:[{...log,address:intent.recipient}]}])assert.throws(()=>verifyTransfer(scope,intent,hash,bad))
assert.throws(()=>verifyTransfer(scope,{...intent,units:'200000'},hash,receipt))
const {pendingArcActivity,queueArcActivity,removeArcActivity}=await import('../src/lib/arcTransferActivity.ts')
const nextHash='0x'+'b'.repeat(64)
queueArcActivity(scope.owner,hash);queueArcActivity(scope.owner,nextHash)
assert.equal(pendingArcActivity(scope.owner).length,2)
assert.equal(pendingArcActivity(intent.recipient).length,0)
removeArcActivity(scope.owner,hash)
assert.deepEqual(pendingArcActivity(scope.owner),[nextHash])
console.log('Exact receipt success, wrong token, missing transfer, amount mismatch and scoped Activity queue passed.')

let release
const first=withPaymentSubmission('payment-one',()=>new Promise(resolve=>release=resolve))
await assert.rejects(withPaymentSubmission('payment-one',async()=>{}),/already/)
assert.equal(await withPaymentSubmission('payment-two',async()=>2),2,'Different payment is not blocked')
release();await first
console.log('Per-payment approval lock allows independent payments and rejects duplicate submission.')
