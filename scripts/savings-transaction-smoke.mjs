import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiParameters} from 'viem'
import {readSavingsTransaction,runSavingsTransaction,verifySavingsReceipt} from '../src/lib/savingsTransaction.ts'
const data=new Map()
globalThis.window={localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}}
const scope={chainId:196,owner:'0x1111111111111111111111111111111111111111',vault:'0x2222222222222222222222222222222222222222',asset:'0x3333333333333333333333333333333333333333'}
const hash='0x'+'a'.repeat(64),planId='0x'+'b'.repeat(64)
const intent={action:'createPlan',amount:'100000',releaseAmount:'100000',interval:604800}
const event=(signature,args,types,values,address)=>({address,topics:encodeEventTopics({abi:parseAbi([signature]),eventName:signature.match(/event (\w+)/)[1],args}),data:encodeAbiParameters(parseAbiParameters(types),values)})
const transfer=(amount=100000n,inbound=true)=>event('event Transfer(address indexed from,address indexed to,uint256 value)',{from:inbound?scope.owner:scope.vault,to:inbound?scope.vault:scope.owner},'uint256',[amount],scope.asset)
const created=()=>event('event PlanCreated(bytes32 indexed planId,address indexed owner,uint256 amount,uint256 releaseAmount,uint48 firstReleaseAt,uint32 interval)',{planId,owner:scope.owner},'uint256,uint256,uint48,uint32',[100000n,100000n,604801,604800],scope.vault)
const receipt=(logs=[created(),transfer()])=>({transactionHash:hash,status:'success',from:scope.owner,to:scope.vault,logs})
verifySavingsReceipt(scope,{hash,intent},receipt())
for(const bad of [receipt([created(),transfer(99999n)]),receipt([{...created(),address:scope.asset},transfer()]),{...receipt(),from:scope.asset},{...receipt(),to:scope.asset},{...receipt(),transactionHash:'0x'+'c'.repeat(64)},receipt([created()])])assert.throws(()=>verifySavingsReceipt(scope,{hash,intent},bad))
const withdrawal={action:'withdraw',planId,amount:'100000'}
const withdrawn=(amount=100000n,id=planId)=>event('event SavingsWithdrawn(bytes32 indexed planId,address indexed owner,uint256 amount)',{planId:id,owner:scope.owner},'uint256',[amount],scope.vault)
verifySavingsReceipt(scope,{hash,intent:withdrawal},receipt([withdrawn(),transfer(100000n,false)]))
assert.throws(()=>verifySavingsReceipt(scope,{hash,intent:withdrawal},receipt([withdrawn(99999n),transfer(100000n,false)])))
assert.throws(()=>verifySavingsReceipt(scope,{hash,intent:withdrawal},receipt([withdrawn(100000n,'0x'+'d'.repeat(64)),transfer(100000n,false)])))
const completed=event('event EmergencyExitCompleted(bytes32 indexed planId,address indexed owner,uint256 amount)',{planId,owner:scope.owner},'uint256',[100000n],scope.vault)
verifySavingsReceipt(scope,{hash,intent:{...withdrawal,action:'completeEmergencyExit'}},receipt([completed,transfer(100000n,false)]))
const approval=event('event Approval(address indexed owner,address indexed spender,uint256 value)',{owner:scope.owner,spender:scope.vault},'uint256',[100000n],scope.asset)
verifySavingsReceipt(scope,{hash,intent:{action:'approve',amount:'100000'}},{...receipt([approval]),to:scope.asset})
let submissions=0
const send=async()=>{submissions++;return hash}
await assert.rejects(runSavingsTransaction(scope,intent,send,async()=>{throw Error('receipt timeout')}),/awaiting verification/)
assert.equal(submissions,1);assert.equal(readSavingsTransaction(scope).hash,hash)
assert.equal(readSavingsTransaction({...scope,owner:scope.asset}),undefined,'Recovery is bound to owner')
// A fresh module simulates reopening the app with empty in-memory caches.
const reopened=await import('../src/lib/savingsTransaction.ts?reopened=true')
const recovered=await reopened.runSavingsTransaction(scope,{...intent,amount:'999999'},async()=>{throw Error('MUST_NOT_RESUBMIT')},async()=>receipt())
assert.equal(recovered.amount,'100000');assert.equal(submissions,1)
// Finish the original in-memory session too; already-confirmed receipt recovery cannot submit.
await runSavingsTransaction(scope,intent,async()=>{throw Error('MUST_NOT_RESUBMIT')},async()=>receipt())
assert.equal(readSavingsTransaction(scope),undefined)
await assert.rejects(runSavingsTransaction(scope,intent,send,async()=>receipt([created(),transfer(1n)])),/awaiting verification/)
assert.ok(readSavingsTransaction(scope),'Mismatched receipt remains unresolved')
await runSavingsTransaction(scope,intent,async()=>{throw Error('MUST_NOT_RESUBMIT')},async()=>receipt())
await assert.rejects(runSavingsTransaction(scope,intent,send,async()=>({...receipt(),status:'reverted'})),/reverted/)
assert.equal(readSavingsTransaction(scope),undefined,'Confirmed revert permits a new user-authorized attempt')
const before=submissions
await assert.rejects(runSavingsTransaction(scope,intent,async()=>{throw Object.assign(Error('user rejected'),{code:4001})},async()=>receipt()),/user rejected/)
assert.equal(submissions,before);assert.equal(readSavingsTransaction(scope),undefined)
const storage=window.localStorage.setItem;window.localStorage.setItem=()=>{throw Error('storage blocked')}
await assert.rejects(runSavingsTransaction(scope,intent,send,async()=>receipt()),/storage blocked/)
assert.equal(submissions,before,'Unavailable recovery storage must block submission')
window.localStorage.setItem=storage
let release
const active=runSavingsTransaction(scope,intent,async()=>{await new Promise(resolve=>release=resolve);return send()},async()=>receipt())
await assert.rejects(runSavingsTransaction(scope,intent,send,async()=>receipt()),/already being checked/)
release();await active
console.log('Savings receipt identity, exact transfers, timeout/reopen recovery, revert, rejection, storage and duplicate-submit checks passed.')

const replacementHash='0x'+'e'.repeat(64)
await runSavingsTransaction(scope,intent,send,async(_hash,onReplacement)=>{onReplacement({hash:replacementHash,reason:'repriced'});return {...receipt(),transactionHash:replacementHash}})
assert.equal(readSavingsTransaction(scope),undefined,'A confirmed fee replacement recovers the same operation')
await assert.rejects(runSavingsTransaction(scope,intent,send,async(_hash,onReplacement)=>{onReplacement({hash:replacementHash,reason:'cancelled'});return {...receipt([]),transactionHash:replacementHash,to:scope.owner}}),/wallet replaced/)
assert.equal(readSavingsTransaction(scope),undefined,'Confirmed wallet cancellation must not strand the original hash')
console.log('Savings fee replacement and confirmed cancellation recovery checks passed.')

const { savingsPaymentReceipt } = await import('../src/lib/savingsReceipt.ts')
const { paymentReceiptView, arcTransactionUrl } = await import('../src/lib/paymentReceiptPdf.ts')
const { readSavingsReceiptReferences } = await import('../src/lib/savingsTransaction.ts')
const blockHash = '0x' + 'f'.repeat(64)
const chainScope = { ...scope, chainId: 196 }
const chainReceipt = { ...receipt(), blockHash }
const block = { hash: blockHash, timestamp: 1788857663n }
const exported = savingsPaymentReceipt(chainScope, {hash,intent}, chainReceipt, block)
assert.equal(exported.amount,'0.1')
assert.equal(exported.createdAt,1788857663000)
assert.equal(exported.eventId,planId)
assert.equal(paymentReceiptView(exported).statusLabel,'Savings deposited')
assert.ok(arcTransactionUrl(exported).startsWith('https://www.oklink.com/xlayer/tx/'))
assert.ok(arcTransactionUrl({txHash:hash}).startsWith('https://testnet.arcscan.app/tx/'))
assert.throws(()=>savingsPaymentReceipt(chainScope,{hash,intent},chainReceipt,{...block,hash:'0x00'}))
assert.throws(()=>savingsPaymentReceipt({...chainScope,chainId:1},{hash,intent},chainReceipt,block))
assert.throws(()=>savingsPaymentReceipt(chainScope,{hash,intent:{...intent,amount:'500000'}},chainReceipt,block))
const withdrawnExport = savingsPaymentReceipt(chainScope,{hash,intent:withdrawal},{...receipt([withdrawn(),transfer(100000n,false)]),blockHash},block)
assert.equal(paymentReceiptView(withdrawnExport).statusLabel,'Savings withdrawn')
assert.equal(withdrawnExport.amount,'0.1')
assert.equal(readSavingsReceiptReferences({...scope,owner:scope.asset}).length,0)
assert.ok(readSavingsReceiptReferences(scope).length > 0)
assert.equal(new Set(readSavingsReceiptReferences(scope).map(item=>item.hash)).size,readSavingsReceiptReferences(scope).length)
console.log('Savings export amounts, timestamps, plan identity, network links and scoped receipt references passed.')

// A damaged optional receipt index must not trap a verified monetary operation.
const historyKey = `hashpaystream:savings-transaction:${scope.chainId}:${scope.owner.toLowerCase()}:${scope.vault.toLowerCase()}:${scope.asset.toLowerCase()}:receipts`
window.localStorage.setItem(historyKey,'{broken')
await runSavingsTransaction(scope,intent,send,async()=>receipt())
assert.equal(readSavingsTransaction(scope),undefined)
assert.equal(readSavingsReceiptReferences(scope)[0].hash,hash)
assert.equal(window.localStorage.getItem(`${historyKey}:unreadable`),'{broken','Preserve the damaged index for recovery')
console.log('Damaged receipt index cannot trap a confirmed savings transaction.')

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis,'navigator')
let lockHeld=false
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_key,options,callback)=>{
 assert.equal(options.ifAvailable,true)
 if(lockHeld)return callback(null)
 lockHeld=true
 try{return await callback({name:_key})}finally{lockHeld=false}
}}}})
const otherTab=await import('../src/lib/savingsTransaction.ts?otherTab=exclusive')
let allowSubmit
const firstTab=runSavingsTransaction(scope,intent,async()=>{await new Promise(resolve=>allowSubmit=resolve);return send()},async()=>receipt())
await assert.rejects(otherTab.runSavingsTransaction(scope,intent,async()=>{throw Error('DUPLICATE_SUBMISSION')},async()=>receipt()),/another tab/)
allowSubmit();await firstTab
if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator
console.log('Separate module/tab savings operations share an exclusive browser lock.')

const normalSet=window.localStorage.setItem
window.localStorage.setItem=(key,value)=>{if(key===historyKey)throw Error('storage quota');return normalSet.call(window.localStorage,key,value)}
await assert.rejects(runSavingsTransaction(scope,intent,send,async()=>receipt()),/confirmed, but its receipt could not be saved/)
assert.ok(readSavingsTransaction(scope),'Keep the confirmed hash until receipt storage can recover')
window.localStorage.setItem=normalSet
await runSavingsTransaction(scope,intent,async()=>{throw Error('MUST_NOT_RESUBMIT')},async()=>receipt())
assert.equal(readSavingsTransaction(scope),undefined)
console.log('Receipt storage failure remains truthful and recovers without resubmission.')
