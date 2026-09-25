import assert from 'node:assert/strict'
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import TestRenderer,{act} from 'react-test-renderer'
const source=fs.readFileSync('src/components/HostedStockSend.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText
let reply,resolve,hold=false,calls=[];const getAccessToken=async()=>'fixture'
const context={exports:{},React,...React,AbortController,setTimeout,clearTimeout,usePrivy:()=>({getAccessToken}),HostedAccountConnection:()=>React.createElement('p',null,'Connect wallet'),fetchWithTimeout:async(path,init)=>{calls.push({path,body:JSON.parse(init.body)});if(hold)await new Promise(r=>resolve=r);return {ok:true,json:async()=>reply}}}
vm.runInNewContext(code,context);let tree
const drain=async()=>{for(let n=0;n<10;n++)await Promise.resolve()}
const mount=async()=>act(async()=>{tree=TestRenderer.create(React.createElement(context.exports.default));await drain()})
const links=()=>tree.root.findAllByType('a')
reply={ok:true,walletSource:'connected',chainId:196,checkoutUrl:'https://app.hashpaylink.com/wallet/stocks/wst_'+'a'.repeat(64)}
await mount();assert.equal(links().length,1);assert.match(links()[0].props.href,/asset=NVDAx/);assert.deepEqual(calls[0].body,{source:'connected'});await act(async()=>tree.unmount())
reply={...reply,checkoutUrl:'https://evil.example/'};await mount();assert.equal(links().length,0);assert.match(JSON.stringify(tree.toJSON()),/did not match/);await act(async()=>tree.unmount())
reply={ok:false,needsConnection:true};await mount();assert.match(JSON.stringify(tree.toJSON()),/Continue after connecting/);assert.equal(links().length,0);await act(async()=>tree.unmount())
reply={ok:true,walletSource:'legacy',chainId:196,checkoutUrl:'https://app.hashpaylink.com/wallet/stocks/wst_'+'a'.repeat(64)};await mount();assert.equal(links().length,0);await act(async()=>tree.unmount())
hold=true;await mount();assert.match(JSON.stringify(tree.toJSON()),/Opening stock wallet/);await act(async()=>tree.unmount());await act(async()=>{resolve();await drain()})
console.log('Hosted stock Send UI: server-selected account, connection needed, expected chain/source/link, default stock and unmounted request cancellation passed.')
