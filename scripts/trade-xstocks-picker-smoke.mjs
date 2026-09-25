import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import TestRenderer,{act} from 'react-test-renderer';
import {getAddress,formatUnits} from 'viem';
const source=fs.readFileSync('src/components/XStockPaymentPicker.tsx','utf8').replace(/^import .*\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const address='0x'+'11'.repeat(20),asset={address:'0x'+'22'.repeat(20),name:'Example stock',symbol:'TESTx',decimals:18};
let user='a',enabled=true,reply,hold=false,balanceFailure=false,changed;
const hash='0x'+'aa'.repeat(32);
const context={exports:{},React,...React,getAddress,formatUnits,AbortController,parseAbi:x=>x,http:()=>null,xLayer:{},
 usePrivy:()=>({user:{id:user}}),useWallets:()=>({ready:true,wallets:[{walletClientType:'privy',address}]}),
 XStockTokenPicker:props=>React.createElement('picker',props),
 communityRequest:async()=>hold?await new Promise(resolve=>{reply=resolve}):{enabled,assets:enabled?[asset]:[]},
 createPublicClient:()=>({getChainId:async()=>196,getBlock:async()=>({hash,number:1n,timestamp:BigInt(Math.floor(Date.now()/1000))}),multicall:async()=>{if(balanceFailure)throw Error('offline');return [{status:'success',result:1250000000000000000n}];}}),
};
vm.runInNewContext(compiled,context);
const props={value:'',getAccessToken:async()=>user,onChange:asset=>{changed=asset}};
const drain=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};let renderer;
const mount=async()=>{await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default,props));await drain();});};
await mount();let picker=renderer.root.findByType('picker');assert.equal(picker.props.tokens[0].balance,'1.25');picker.props.onChange(asset);assert.equal(changed.address,asset.address);changed=null;picker.props.onChange({...asset,address:'0x'+'33'.repeat(20)});assert.equal(changed,null);await assert.rejects(picker.props.discover,/approved/);await act(async()=>renderer.unmount());
balanceFailure=true;await mount();assert.equal(renderer.root.findByType('picker').props.tokens[0].balance,null,'failed balance is unknown, not zero');await act(async()=>renderer.unmount());
balanceFailure=false;hold=true;await mount();const oldReply=reply;hold=false;enabled=false;user='b';await act(async()=>{renderer.update(React.createElement(context.exports.default,props));await drain();});await act(async()=>{oldReply({enabled:true,assets:[asset]});await drain();});picker=renderer.root.findByType('picker');assert.equal(picker.props.tokens.length,0);assert.equal(picker.props.disabled,true,'old account response must not restore assets');await act(async()=>renderer.unmount());
console.log('Pocket picker adapter passed: exact balances, unavailable balances, approved-only selection, rejected arbitrary tokens, disabled flow and account-switch response isolation.');
