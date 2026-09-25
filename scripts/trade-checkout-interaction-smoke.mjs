import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {unlink} from 'node:fs/promises';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const output=new URL('../.codex-temp/trade-interaction.mjs',import.meta.url);
globalThis.window=new EventTarget();
let resolveRead;const calls=[];
globalThis.__tradeRequest=async(_path,_token,payload)=>{calls.push(payload.action);if(payload.action==='status')return new Promise(resolve=>{resolveRead=()=>resolve({mode:'hosted',enabled:true,ready:false})});return {mode:'hosted',enabled:true,ready:true,buyerReady:true,sellerReady:true};};
await build({entryPoints:['src/components/TradeCheckout.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:output.pathname.replace(/^\/([A-Za-z]:)/,'$1'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/(@privy-io\/react-auth|PrivyTradeCheckout|HostedAccountConnection|lib\/tradeCommunity)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('react-auth')?`const getAccessToken=async()=> 'fixture';export const usePrivy=()=>({user:{id:'fixture'},getAccessToken});`:a.path.includes('tradeCommunity')?`export const communityRequest=(...args)=>globalThis.__tradeRequest(...args);`:`export default function Fixture(){return null;}`}));}}]});
try{const {default:Checkout}=await import(output.href);let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(Checkout,{thread:{id:'thread',role:'buyer'},offer:{id:'offer'},getAccessToken:async()=> 'fixture',onCancelAvailability(){}}));});
await act(async()=>{resolveRead()});
const find=name=>tree.root.findAllByType('button').find(b=>b.children.join('')===name);
// Trigger background refresh using the actual listener registered by the component.
await act(async()=>{window.dispatchEvent(new Event('focus'))});
await act(async()=>{find('Use Hash PayLink account').props.onClick()});
assert.ok(find('Connecting account...'),'User gets immediate progress instead of a dropped click');assert.deepEqual(calls,['status','status']);
await act(async()=>{resolveRead()});assert.deepEqual(calls,['status','status','connect']);assert.ok(find('Continue to checkout'));
await act(async()=>tree.unmount());console.log('Trade connection waits for an in-flight refresh and runs the user action exactly once.');
}finally{await unlink(output)}
