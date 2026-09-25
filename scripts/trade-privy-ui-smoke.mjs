import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {getAddress,parseUnits} from 'viem';
import {TRADE_ACTION_LABELS,TRADE_XLAYER_ARBITER} from '../src/lib/tradeXLayerProtocol.ts';
import {tradeTotal} from '../src/lib/tradeAgreement.ts';
import {xStockPaymentLabel} from '../src/lib/xStocksAssets.ts';
const source=fs.readFileSync('src/components/PrivyTradeCheckout.tsx','utf8').replace(/^import .*\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const address=getAddress('0x'+'11'.repeat(20)),token=getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061'),escrow=getAddress('0x'+'22'.repeat(20));
const hash='0x'+'aa'.repeat(32);
let userId='user-a',state='approve',sendError,consent=true,confirmCalls=0,signs=[],lastTx,resolveConfirm;
const storage=new Map();
const wallet={walletClientType:'privy',address,switchChain:async chain=>assert.equal(chain,196)};
const props={thread:{id:'thread',role:'buyer',title:'Test item'},offer:{id:'offer',terms:{currency:'USDC',price:'1.00',deliveryFee:'0.00'}},onCancelAvailability:()=>{}};
const context={exports:{},React,...React,getAddress,parseUnits,tradeTotal,xStockPaymentLabel,TRADE_ACTION_LABELS,TRADE_XLAYER_ARBITER,
 usePrivy:()=>({user:{id:userId},getAccessToken:async()=>userId}),useWallets:()=>({wallets:[wallet],ready:true}),
 useSendTransaction:()=>({sendTransaction:async(tx,options)=>{signs.push({tx,options});if(sendError)throw sendError;lastTx=tx;state=state==='approve'?'fund':'done';return {hash};}}),
 useStreamConfirm:()=>({confirmation:null,confirm:async()=>{confirmCalls++;return consent==='wait'?new Promise(r=>{resolveConfirm=r}):consent;}}),
 communityRequest:async(path,_token,payload)=>{
  if(path.startsWith('checkout?'))return {offerStatus:'accepted',buyerReady:true,sellerReady:true,wallet:{address,chainId:196},reservation:{id:'reservation'}};
  if(path==='xlayer-checkout')return {enabled:true,state:state==='done'?2:1,actions:state==='done'?[]:[state],amount:'1000000',token,decimals:6,...(payload?.action?{transaction:{account:address,to:payload.action==='approve'?token:escrow,data:'0x1234',chainId:196,value:'0'}}:{})};
  throw Error('Unexpected API call');
 },http:()=>null,createPublicClient:()=>({waitForTransactionReceipt:async()=>({status:'success',transactionHash:hash}),getTransaction:async()=>({from:address,to:lastTx.to,input:lastTx.data,value:0n})}),
 localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 setInterval:()=>1,clearInterval:()=>{},
};
vm.runInNewContext(compiled,context);
let renderer;
const drain=async()=>{for(let i=0;i<40;i++)await new Promise(r=>setImmediate(r));};
const mount=async()=>{await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default,props));await drain();});};
const button=label=>renderer.root.findAllByType('button').find(b=>b.children.includes(label));
await mount();
await act(async()=>{const click=button('Pay into escrow').props.onClick;click();click();await drain();});
assert.equal(confirmCalls,1);assert.equal(signs.length,2,'one approval and one funding despite double click');
assert.ok(signs.every(s=>s.options.uiOptions.showWalletUIs===false&&s.options.address===address));
assert.equal(storage.size,0);await act(async()=>renderer.unmount());
state='approve';signs=[];consent=false;await mount();await act(async()=>{button('Pay into escrow').props.onClick();await drain();});assert.equal(signs.length,0);await act(async()=>renderer.unmount());
state='approve';consent='wait';await mount();await act(async()=>{button('Pay into escrow').props.onClick();await drain();});
userId='user-b';await act(async()=>{renderer.update(React.createElement(context.exports.default,props));await drain();});
await act(async()=>{resolveConfirm(true);await drain();});assert.equal(signs.length,0,'account switch invalidates consent');await act(async()=>renderer.unmount());
state='approve';consent=true;sendError=Error('Response lost');signs=[];await mount();await act(async()=>{button('Pay into escrow').props.onClick();await drain();});
assert.equal(signs.length,1);assert.equal(storage.size,1);assert.ok(button('Check pending transaction'));assert.equal(button('Pay into escrow'),undefined);
await act(async()=>{button('Check pending transaction').props.onClick();await drain();});assert.equal(signs.length,1,'ambiguous submission must never auto-resend');await act(async()=>renderer.unmount());
console.log('Trade CTA UI passed: single first-party consent, popup-free exact wallet signing, duplicate-click lock, declined consent, account switching and ambiguous-submission containment.');
