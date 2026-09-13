import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer, {act} from 'react-test-renderer'
import {getAddress, isAddress, formatUnits} from 'viem'
const source=fs.readFileSync('src/lib/useSavingsUsdcBalance.ts','utf8').replace(/\r\n/g,'\n').replace(/^import .*\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const address='0xA16D33E7B36099F0EF82048fb78b25754Bf49931'
const signer={address,walletClientType:'privy',getEthereumProvider:async()=>({})}
let auth={ready:true,authenticated:true,user:{id:'owner',linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',address}]}},connected={ready:false,wallets:[signer]}
let deferred=false
const reads=[]
const context={exports:{},...React,getAddress,isAddress,formatUnits,savingsChain:{id:5042002},SAVINGS_USDC_ADDRESS:getAddress('0x3600000000000000000000000000000000000000'),usePrivy:()=>auth,useWallets:()=>connected,
 createPublicClient:()=>({readContract:async()=>deferred ? new Promise(resolve=>reads.push(resolve)) : 100000n}),http:()=>({}),window:{localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}}}
vm.runInNewContext(compiled,context)
let state,root
function Probe(){state=context.exports.useSavingsUsdcBalance();return null}
const mount=async()=>act(async()=>{root=TestRenderer.create(React.createElement(Probe))})
const update=async()=>act(async()=>root.update(React.createElement(Probe)))
await mount()
assert.equal(state.ready,true,'Owned connected signer must not wait for external connectors')
assert.equal(state.address,getAddress(address))
auth={...auth,user:{id:'different-owner',linkedAccounts:[]}}
await update()
assert.equal(state.wallet,undefined,'An old account signer must not survive account switching')
assert.equal(state.ready,false)
auth={...auth,authenticated:false}
connected={ready:true,wallets:[signer]}
await update()
assert.equal(state.ready,false,'SDK readiness cannot authenticate a signed-out account')
assert.equal(state.wallet,undefined)
auth={ready:true,authenticated:true,user:{id:'owner',linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',address}]}}
connected={ready:false,wallets:[signer,{...signer,address:'0x1111111111111111111111111111111111111111'}]}
await update()
assert.equal(state.wallet,undefined,'Multiple embedded signers must fail closed')
assert.equal(state.ready,false)
await act(async()=>root.unmount())
console.log('Savings embedded signer readiness and account isolation checks passed.')

connected={ready:true,wallets:[signer]}
await mount()
deferred=true
let first,second
await act(async()=>{first=state.refresh();second=state.refresh()})
await act(async()=>{reads[1](200000n);await second})
await act(async()=>{reads[0](100000n);await first})
assert.equal(state.units,200000n,'An older RPC balance must not overwrite a newer response')
await act(async()=>root.unmount())
console.log('Arc savings balance refreshes reject out-of-order RPC responses.')
