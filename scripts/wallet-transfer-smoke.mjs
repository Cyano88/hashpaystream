import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi,parseAbiParameters} from 'viem'
import {runWalletTransfer,runCircleTransfer,readPendingTransfer,verifyTransfer} from '../src/lib/walletTransfer.ts'
const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},setTimeout:(fn)=>{fn();return 1}}
const scope={chainId:196,owner:'0x1111111111111111111111111111111111111111',asset:'0x2222222222222222222222222222222222222222'},intent={recipient:'0x3333333333333333333333333333333333333333',units:'100000'}
const hash='0x'+'a'.repeat(64)
const log={address:scope.asset,topics:encodeEventTopics({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),eventName:'Transfer',args:{from:scope.owner,to:intent.recipient}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[100000n])}
const receipt={transactionHash:hash,status:'success',logs:[log]}
verifyTransfer(scope,intent,hash,receipt)
for(const bad of [{...receipt,status:'reverted'},{...receipt,logs:[]},{...receipt,logs:[{...log,address:intent.recipient}]}])assert.throws(()=>verifyTransfer(scope,intent,hash,bad))
assert.throws(()=>verifyTransfer(scope,{...intent,units:'200000'},hash,receipt))
let sends=0
await assert.rejects(runWalletTransfer(scope,intent,async()=>{sends++;return hash},async()=>{throw Error('timeout')}))
assert.equal(readPendingTransfer(scope).hash,hash)
const reopened=await import('../src/lib/walletTransfer.ts?reopened')
assert.equal(await reopened.runWalletTransfer(scope,intent,async()=>{throw Error('NO_RESUBMIT')},async()=>receipt),hash)
await runWalletTransfer(scope,intent,async()=>{throw Error('NO_RESUBMIT')},async()=>receipt)
assert.equal(sends,1)
const arc={...scope,chainId:5042002}
let preparedKeys=[],authorizations=0,lookups=0
const ops={prepare:async(_intent,key)=>{preparedKeys.push(key);if(preparedKeys.length===1)throw Error('prepare response lost');return {challengeId:'same-challenge',transactionId:'same-transaction'}},authorize:async id=>{assert.equal(id,'same-challenge');authorizations++;return {}},lookup:async id=>{assert.equal(id,'same-transaction');lookups++;return {hash:lookups>1?hash:undefined,failed:false}},wait:async()=>receipt}
await assert.rejects(runCircleTransfer(arc,intent,ops))
assert.equal(await runCircleTransfer(arc,{...intent,units:'999'},ops),hash)
assert.equal(preparedKeys[0],preparedKeys[1]);assert.equal(authorizations,1)
assert.equal(readPendingTransfer(arc),undefined)
console.log('Exact transfer events, timeout/reopen recovery, no duplicate sends and Circle preparation-key reuse passed.')

const {pendingArcActivity,queueArcActivity,removeArcActivity}=await import('../src/lib/arcTransferActivity.ts')
const nextHash='0x'+'b'.repeat(64)
queueArcActivity(scope.owner,hash);queueArcActivity(scope.owner,nextHash)
assert.equal(pendingArcActivity(scope.owner).length,2)
assert.equal(pendingArcActivity(intent.recipient).length,0)
removeArcActivity(scope.owner,hash)
assert.deepEqual(pendingArcActivity(scope.owner),[nextHash])
await assert.rejects(runWalletTransfer(scope,intent,async()=>hash,async()=>({...receipt,status:'reverted'})),/reverted/)
assert.equal(readPendingTransfer(scope),undefined)
await assert.rejects(runWalletTransfer(scope,intent,async()=>hash,async()=>({...receipt,logs:[]})))
assert.equal(readPendingTransfer(scope).hash,hash,'Mismatched receipt must retain its hash')
await runWalletTransfer(scope,intent,async()=>{throw Error('NO_RESUBMIT')},async()=>receipt)
console.log('Scoped Activity queue, confirmed revert and mismatched receipt recovery passed.')
