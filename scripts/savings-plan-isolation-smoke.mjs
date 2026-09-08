import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {getAddress} from 'viem'
const owner='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222',vault='0x3333333333333333333333333333333333333333',asset='0x4444444444444444444444444444444444444444'
let wallet={address:owner,ready:true},config={vaultAddress:vault,configReady:true,depositsEnabled:true},defer=false,pending=[]
const source=fs.readFileSync('src/lib/useSavingsVault.ts','utf8').split('export function useSavingsVault()')[1]
const compiled=ts.transpileModule('export function useSavingsVault()'+source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const context={readSavingsTransaction:()=>undefined,exports:{},...React,getAddress,useXLayerUsdcBalance:()=>wallet,useSavingsRuntimeConfig:()=>config,upfrontXLayerChain:{id:196},http:()=>({}),XLAYER_USDC_ADDRESS:asset,SAVINGS_VAULT_ABI:[],PLAN_ID_PAGE_SIZE:100n,PLAN_READ_BATCH_SIZE:20,nextSavingsRelease:()=>0,
 createPublicClient:()=>({getBlockNumber:async()=>100n,readContract:async({functionName,args})=>{
 if(functionName==='asset')return asset
 if(functionName==='planCount'){if(defer)await new Promise(resolve=>pending.push(resolve));return 1n}
 if(functionName==='planIdsPage')return [args[0]]
 if(functionName==='plans')return [args[0],100000n,0n,100000n,1,604800,0]
 return 100000n
 }}),window:{setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}}}
vm.runInNewContext(compiled,context)
let state,root
function Probe(){state=context.exports.useSavingsVault();return null}
const render=async()=>act(async()=>root.update(React.createElement(Probe)))
await act(async()=>{root=TestRenderer.create(React.createElement(Probe))})
assert.equal(state.savedUnits,100000n);assert.equal(state.depositsEnabled,true)
wallet={address:undefined,ready:false};await render()
assert.equal(state.plans.length,0,'Connecting must not expose previous owner plans')
assert.equal(state.savedUnits,0n);assert.equal(state.depositsEnabled,false)
defer=true;wallet={address:other,ready:true};await render()
assert.equal(state.plans.length,0);assert.equal(state.depositsEnabled,false)
wallet={address:owner,ready:false};await render()
await act(async()=>{pending.splice(0).forEach(resolve=>resolve())})
assert.equal(state.depositsEnabled,false,'Stale response cannot authorize deposits')
assert.ok(state.plans.every(plan=>plan.id===owner),'Stale response cannot replace current owner plans')
defer=false;wallet={address:owner,ready:true};await render()
assert.equal(state.depositsEnabled,true)
config={...config,vaultAddress:'0x5555555555555555555555555555555555555555'};defer=true;await render()
assert.equal(state.plans.length,0,'Changing vault must hide previous vault balances')
assert.equal(state.depositsEnabled,false)
await act(async()=>root.unmount())
await act(async()=>pending.splice(0).forEach(resolve=>resolve()))
console.log('Savings plan owner, vault and stale-response isolation checks passed.')
