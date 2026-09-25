import assert from 'node:assert/strict'
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import TestRenderer,{act} from 'react-test-renderer'
import {stockPortfolioExpiresAt,stockPortfolioValueIsFresh} from '../src/lib/readStockBalances.ts'
let clock=Date.now(),user='a',fail=false,hold=false,reply,total=12.5,calls=0,ready=true,tokenHold=false
let observed=clock,priceTime=clock
const timers=new Map(),intervals=new Map(),events=new Map();let nextId=1
const document={visibilityState:'visible',addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)}
const window={setTimeout:(f,delay)=>{const id=nextId++;timers.set(id,{f,at:clock+delay});return id},clearTimeout:id=>timers.delete(id),setInterval:f=>{const id=nextId++;intervals.set(id,f);return id},clearInterval:id=>intervals.delete(id),addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)}
const source=fs.readFileSync('src/components/StocksBalanceCard.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const portfolio=()=>({chainId:196,gas:{symbol:'OKB',balance:'0.025',units:'25000000000000000',decimals:18,observedAt:observed,stale:false},complete:true,stale:false,estimatedValueUsd:total,observedAt:observed,holdings:[{address:'0x1',symbol:'TESTx',balance:'1.25',priceObservedAt:priceTime}]})
const context={exports:{},React,...React,AbortController,Intl,window,document,Date:class extends Date{static now(){return clock}},stockPortfolioExpiresAt,stockPortfolioValueIsFresh,ChartBarIcon:()=>null,usePrivy:()=>({ready,user:{id:user,linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',connectorType:'embedded',address:'0x'+'1'.repeat(40)}]},getAccessToken:async()=>tokenHold ? new Promise(()=>{}) : user}),useWallets:()=>({ready,wallets:[{walletClientType:'privy',address:'0x'+'1'.repeat(40)}]}),readStockBalances:async()=>{calls++;if(hold)return new Promise(r=>reply=r);if(fail)throw Error('offline');return portfolio()}}
vm.runInNewContext(code,context);let renderer
const drain=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r))}
const actRun=async fn=>act(async()=>{fn();await drain()})
const text=()=>JSON.stringify(renderer.toJSON())
await actRun(()=>{renderer=TestRenderer.create(React.createElement(context.exports.default))});assert.match(text(),/12.50/)
assert.match(text(),/0.025/);assert.doesNotMatch(text(),/Refresh balances|Refreshing\.\.\./)
// Returning Home preserves this account's display while a new read runs silently.
await actRun(()=>renderer.unmount());hold=true
await actRun(()=>{renderer=TestRenderer.create(React.createElement(context.exports.default))});assert.match(text(),/12.50/);assert.doesNotMatch(text(),/Loading stock balances|Refreshing\.\.\./)
hold=false;await actRun(()=>reply(portfolio()))
// The price can expire before the more recently read holdings.
priceTime=clock-50000;observed=clock;await actRun(()=>events.get('focus')());clock+=10001
await actRun(()=>{for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.f()}});assert.doesNotMatch(text(),/12.50/);assert.match(text(),/Last known balances/)
// Visible automatic refresh, with one in-flight request even when focus repeats.
priceTime=clock;observed=clock;hold=true;const before=calls;await actRun(()=>[...intervals.values()][0]());await actRun(()=>events.get('focus')());assert.equal(calls,before+1);hold=false;await actRun(()=>reply(portfolio()));assert.match(text(),/12.50/)
// Hidden tabs do not poll; returning to the native app refreshes.
document.visibilityState='hidden';const hiddenCalls=calls;await actRun(()=>[...intervals.values()][0]());assert.equal(calls,hiddenCalls);document.visibilityState='visible';await actRun(()=>events.get('hashpaystream:resume')());assert.equal(calls,hiddenCalls+1)
// Failure cannot revive an expired estimate.
clock+=60001;fail=true;await actRun(()=>events.get('online')());assert.doesNotMatch(text(),/12.50/);assert.match(text(),/Last known balances/)
fail=false;hold=true;await actRun(()=>events.get('focus')());const old=reply;hold=false;user='b';total=null;observed=clock;priceTime=clock;await actRun(()=>renderer.update(React.createElement(context.exports.default)));await actRun(()=>old({...portfolio(),estimatedValueUsd:999}));assert.doesNotMatch(text(),/999/)
await actRun(()=>renderer.unmount());assert.equal(timers.size,0);assert.equal(intervals.size,0);assert.equal(events.size,0)
// Wallet SDK readiness and token acquisition must both finish with a retry state.
ready=false;await actRun(()=>{renderer=TestRenderer.create(React.createElement(context.exports.default))});clock+=10001
await actRun(()=>{for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.f()}});assert.match(text(),/Stock balances are not available yet/);assert.doesNotMatch(text(),/Loading stock balances/)
ready=true;tokenHold=true;await actRun(()=>renderer.update(React.createElement(context.exports.default)));clock+=50001
await actRun(()=>{for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.f()}});assert.match(text(),/Stock balances could not be loaded/);assert.doesNotMatch(text(),/Loading stock balances/)
await actRun(()=>renderer.unmount());assert.equal(timers.size,0);assert.equal(intervals.size,0)
assert.equal(stockPortfolioValueIsFresh({...portfolio(),estimatedValueUsd:1,observedAt:clock+60000},clock),false)
console.log('Stocks card passed: provider timestamp expiry, automatic refresh, no overlapping reads, background pause, native resume, failed refresh, account isolation and cleanup.')
