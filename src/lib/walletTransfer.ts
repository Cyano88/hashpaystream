import { getAddress, parseAbi, parseEventLogs, type Address, type Hex, type TransactionReceipt } from 'viem'
export type TransferScope = { chainId: number; owner: Address; asset: Address }
export type TransferIntent = { recipient: Address; units: string }
type Pending = TransferIntent & { key: string; hash?: Hex; challengeId?: string; transactionId?: string; superseded?: boolean }
const memory = new Map<string, Pending>()
const busy = new Set<string>()
export const transferStorageKey = (scope: TransferScope) => `hashpaystream:transfer:${scope.chainId}:${scope.owner.toLowerCase()}:${scope.asset.toLowerCase()}`
export function readPendingTransfer(scope: TransferScope): Pending | undefined {
  const key = transferStorageKey(scope)
  const raw = window.localStorage.getItem(key)
  return memory.get(key) ?? (raw ? JSON.parse(raw) : undefined)
}
function save(scope: TransferScope, value: Pending) { const key=transferStorageKey(scope); memory.set(key,value); window.localStorage.setItem(key,JSON.stringify(value)) }
function clear(scope: TransferScope) { const key=transferStorageKey(scope); window.localStorage.removeItem(key); memory.delete(key) }
export function verifyTransfer(scope: TransferScope, intent: TransferIntent, hash: Hex, receipt: TransactionReceipt) {
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || receipt.status !== 'success') throw Error('Transfer is not confirmed.')
  const events=parseEventLogs({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),logs:receipt.logs.filter(log=>getAddress(log.address)===getAddress(scope.asset))})
  const matches=events.filter(event=>getAddress(event.args.from)===getAddress(scope.owner) && getAddress(event.args.to)===getAddress(intent.recipient))
  if(matches.length!==1 || matches[0].args.value!==BigInt(intent.units))throw Error('Transfer confirmation does not match the intended recipient and amount.')
}
async function exclusive<T>(scope:TransferScope, operation:()=>Promise<T>):Promise<T> {
  const key=transferStorageKey(scope)
  const run=async()=>{if(busy.has(key))throw Error('A transfer is already being checked.');busy.add(key);try{return await operation()}finally{busy.delete(key)}}
  if(typeof navigator!=='undefined' && navigator.locks)return navigator.locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('A transfer is already being checked in another tab.');return run()})
  return run()
}
type Wait = (hash: Hex, replace: (hash: Hex, reason: string)=>void)=>Promise<TransactionReceipt>
async function confirm(scope:TransferScope,pending:Pending,wait:Wait) {
  const receipt=await wait(pending.hash!, (hash,reason)=>{pending={...pending,hash,superseded:pending.superseded || reason!=='repriced'};save(scope,pending)})
  if(receipt.transactionHash.toLowerCase()!==pending.hash!.toLowerCase())throw Error('Transfer hash mismatch.')
  if(receipt.status==='reverted' || pending.superseded){clear(scope);throw Error('The transaction reverted or was replaced. Review its result before starting a new transfer.')}
  verifyTransfer(scope,pending,pending.hash!,receipt)
  clear(scope)
  return pending.hash!
}
export async function runWalletTransfer(scope:TransferScope,intent:TransferIntent,submit:()=>Promise<Hex>,wait:Wait) {
  return exclusive(scope,async()=>{
    let pending=readPendingTransfer(scope)
    if(!pending){
      const probe=transferStorageKey(scope)+':probe';window.localStorage.setItem(probe,'1');window.localStorage.removeItem(probe)
      const hash=await submit();pending={...intent,key:hash,hash};save(scope,pending)
    }
    return confirm(scope,pending,wait)
  })
}
export async function runCircleTransfer(scope:TransferScope,intent:TransferIntent,operations:{
  prepare:(intent:TransferIntent,key:string)=>Promise<{challengeId:string;transactionId?:string}>
  authorize:(challengeId:string)=>Promise<{hash?:Hex;transactionId?:string}>
  lookup:(transactionId:string)=>Promise<{hash?:Hex;failed:boolean}>
  wait:Wait
}) {
  return exclusive(scope,async()=>{
    let pending=readPendingTransfer(scope)
    if(!pending){pending={...intent,key:crypto.randomUUID()};save(scope,pending)}
    if(!pending.hash && !pending.challengeId){const prepared=await operations.prepare(pending,pending.key);if(!prepared.challengeId)throw Error('Payment challenge is unavailable. Check transfer to retry.');pending={...pending,...prepared};save(scope,pending)}
    const lookup=async()=>{
      if(!pending!.transactionId)return
      const status=await operations.lookup(pending!.transactionId)
      if(status.failed){clear(scope);throw Error('Circle reports that this transfer failed or was cancelled.')}
      if(status.hash){pending={...pending!,hash:status.hash};save(scope,pending)}
    }
    if(!pending.hash)await lookup()
    if(!pending.hash){const result=await operations.authorize(pending.challengeId!);pending={...pending,hash:result.hash ?? pending.hash,transactionId:result.transactionId ?? pending.transactionId};save(scope,pending)}
    for(let attempt=0;!pending.hash && pending.transactionId && attempt<24;attempt++){await new Promise(resolve=>window.setTimeout(resolve,2500));await lookup()}
    if(!pending.hash)throw Error('Transfer is awaiting confirmation. Check transfer to continue.')
    return confirm(scope,pending,operations.wait)
  })
}
