import assert from 'node:assert/strict'
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import TestRenderer,{act} from 'react-test-renderer'
const source=fs.readFileSync('src/components/StocksBalanceCard.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
let user='a',fail=false,hold=false,reply,total=12.5
const context={exports:{},React,...React,AbortController,Intl,ChartBarIcon:()=>null,usePrivy:()=>({user:{id:user},getAccessToken:async()=>user}),useWallets:()=>({ready:true,wallets:[{walletClientType:'privy',address:'0x'+'1'.repeat(40)}]}),readStockBalances:async()=>{if(hold)return new Promise(r=>reply=r);if(fail)throw Error('offline');return {chainId:196,complete:true,stale:false,estimatedValueUsd:total,holdings:[{address:'0x1',symbol:'TESTx',balance:'1.25'}]}}}
vm.runInNewContext(code,context);let renderer
const drain=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r))}
const mount=async()=>{await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default));await drain()})}
const text=()=>JSON.stringify(renderer.toJSON())
await mount();assert.match(text(),/12.50/);assert.match(text(),/1.25/);await act(async()=>renderer.unmount())
fail=true;await mount();assert.match(text(),/could not be loaded/);assert.doesNotMatch(text(),/12.50/);await act(async()=>renderer.unmount())
fail=false;total=null;await mount();assert.doesNotMatch(text(),/12.50/);assert.match(text(),/TESTx/);await act(async()=>renderer.unmount())
hold=true;await mount();const old=reply;hold=false;user='b';await act(async()=>{renderer.update(React.createElement(context.exports.default));await drain()});await act(async()=>{old({complete:true,stale:false,estimatedValueUsd:999,holdings:[]});await drain()});assert.doesNotMatch(text(),/999/);await act(async()=>renderer.unmount())
console.log('Stocks card passed: API total, exact quantities, unavailable values, errors and account-switch isolation.')
