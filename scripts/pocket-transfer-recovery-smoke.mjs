import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {formatUnits} from 'viem'
import {readPendingTransfer,transferStorageKey} from '../src/lib/walletTransfer.ts'
const storage=new Map(),localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
globalThis.window={localStorage}
const scope={chainId:5042002,owner:'0x1111111111111111111111111111111111111111',asset:'0x3600000000000000000000000000000000000000'}
const intent={recipient:'0x2222222222222222222222222222222222222222',units:'100000'}
const oldId='11111111-1111-4111-8111-111111111111'
localStorage.setItem(transferStorageKey(scope),JSON.stringify({...intent,key:oldId,challengeId:'22222222-2222-4222-8222-222222222222'}))
let actor='owner',value,failTrack=false,trackCalls=0,requests=[]
const rows=new Map()
const wallet={address:scope.owner,session:{userToken:'synthetic-session'},refreshBalance:async()=>{}}
const xlayer={address:undefined,refresh:async()=>{}}
const getAccessToken=async()=>actor
const source=fs.readFileSync('src/lib/pocketTransfers.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const fetchWithTimeout=async(_url,options)=>{
 const owner=options.headers.authorization.slice(7),body=options.body?JSON.parse(options.body):undefined
 requests.push({owner,body})
 if(!body)return Response.json({transfers:[...rows.values()].filter(r=>r.actor===owner).map(({actor,...r})=>r)})
 if(body.action==='track'){trackCalls++;if(failTrack)throw Error('offline');const row=rows.get(body.id);Object.assign(row,body,{status:'processing'});return Response.json({transfer:row})}
 if(body.action==='reconcile_circle')return Response.json({transfer:rows.get(body.id)})
 let row=rows.get(body.id)
 if(!row){row={...body,actor:owner,status:'awaiting_approval',createdAt:'2026-09-08',updatedAt:'2026-09-08'};rows.set(body.id,row)}
 return Response.json({transfer:row})
}
const context={exports:{},React,...React,formatUnits,readPendingTransfer,transferStorageKey,localStorage,crypto:globalThis.crypto,usePrivy:()=>({user:{id:actor},authenticated:true,getAccessToken}),useCircleWallet:()=>wallet,useXLayerUsdcBalance:()=>xlayer,XLAYER_USDC_ADDRESS:scope.asset,fetchWithTimeout,window:{setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}}}
vm.runInNewContext(compiled,context)
function Probe(){value=context.exports.usePocketTransfers();return null}
let root
await act(async()=>{root=TestRenderer.create(React.createElement(context.exports.PocketTransfersProvider,null,React.createElement(Probe)))})
assert.equal(value.ready,true)
assert.ok(rows.has(oldId),'Legacy Circle idempotency key survives migration')
assert.equal(localStorage.getItem(transferStorageKey(scope)),null,'Remove legacy journal only after durable import')
let first,again
await act(async()=>{first=await value.begin(scope,intent);again=await value.begin(scope,intent)})
assert.equal(first.transfer.id,again.transfer.id,'Unknown preparation response retains one key')
failTrack=true
await act(async()=>{await assert.rejects(value.track(first.transfer.id,{hash:'0x'+'a'.repeat(64),accepted:true}))})
assert.ok([...storage.values()].some(v=>v.includes('0x'+'a'.repeat(64))),'Lost status writes retain the submitted hash')
await act(async()=>root.unmount())
failTrack=false
await act(async()=>{root=TestRenderer.create(React.createElement(context.exports.PocketTransfersProvider,null,React.createElement(Probe)))})
assert.equal(rows.get(first.transfer.id).hash,'0x'+'a'.repeat(64),'Reopening retries status, not a send')
assert.ok(trackCalls>=2)
first.releaseDraft()
let second
await act(async()=>{second=await value.begin(scope,intent)})
assert.notEqual(first.transfer.id,second.transfer.id,'Explicit new payment receives a new key')
actor='different-owner';wallet.address=''
await act(async()=>root.update(React.createElement(context.exports.PocketTransfersProvider,null,React.createElement(Probe))))
assert.deepEqual(Array.from(value.rows),[],'Account switch hides previous payments')
await act(async()=>root.unmount())
console.log('Legacy migration, stable retry keys, durable status-outbox replay, repeat payment and account isolation passed.')
