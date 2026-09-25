import assert from 'node:assert/strict'
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import TestRenderer,{act} from 'react-test-renderer'
import {QRCodeSVG} from 'qrcode.react'
let user='a',address='0x'+'1'.repeat(40),stockAddress='0x'+'2'.repeat(40),pending,hold=false,badNetwork=false
const details=(wallet,chainId)=>({address:wallet,qrValue:wallet,chainId,networkName:chainId===196?'X Layer':'Arc',depositNotice:chainId===196?'Deposit only supported stocks on X Layer.':'Deposit only USDC on Arc.',gasNotice:chainId===196?'Keep a small amount of OKB for network fees.':'Keep a small amount of USDC for network fees.',pocketIdRouting:'not_provided'})
const getAccessToken=async()=> 'fixture-token'
const receiveDetails=async()=>hold?new Promise(resolve=>pending=resolve):details(address,5042)
const src=fs.readFileSync('src/components/StreamPayReceive.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const Icon=()=>null
const context={exports:{},React,...React,QRCodeSVG,ArrowLeftIcon:Icon,CheckIcon:Icon,ClipboardDocumentIcon:Icon,ChevronRightIcon:Icon,ChartBarIcon:Icon,CurrencyDollarIcon:Icon,Link:({children,...props})=>React.createElement('a',props,children),window:{setTimeout,clearTimeout},navigator:{clipboard:{writeText:async value=>{context.copied=value}}},usePrivy:()=>({authenticated:true,getAccessToken,user:{id:user,linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',connectorType:'embedded',address:stockAddress}]}}),useCircleWallet:()=>({address,receiveDetails}),useStreamAccount:()=>({profile:{pocketId:'12345678'},loading:false,error:''}),useStreamPayPath:p=>p,fetchWithTimeout:async()=>({ok:true,json:async()=>({ok:true,receive:details(stockAddress,badNetwork?5042:196)})}),AgreementSignInLanding:()=>null}
vm.runInNewContext(code,context);let root
const drain=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r))}
const run=async f=>act(async()=>{f();await drain()})
const clickText=text=>root.root.findAllByType('button').find(b=>JSON.stringify(b.toJSON?.()??b.props.children).includes(text))
await run(()=>{root=TestRenderer.create(React.createElement(context.exports.default))})
assert.equal(root.root.findAllByType(QRCodeSVG).length,0)
await run(()=>root.root.findAllByType('button')[1].props.onClick())
assert.equal(root.root.findByType(QRCodeSVG).props.value,stockAddress)
assert.match(JSON.stringify(root.toJSON()),/Keep a small amount of OKB/)
await run(()=>root.root.findByProps({'aria-label':'Back to receive options'}).props.onClick())
await run(()=>root.root.findAllByType('button')[0].props.onClick())
assert.equal(root.root.findByType(QRCodeSVG).props.value,address)
assert.match(JSON.stringify(root.toJSON()),/Deposit only USDC on Arc/)
// New account must not see the previous account's QR while its API request is pending.
hold=true;user='b';address='0x'+'3'.repeat(40)
await run(()=>root.update(React.createElement(context.exports.default)))
assert.equal(root.root.findAllByType(QRCodeSVG).length,0)
await run(()=>pending(details(address,5042)))
assert.equal(root.root.findByType(QRCodeSVG).props.value,address)
await run(()=>root.root.findByProps({'aria-label':'Back to receive options'}).props.onClick())
badNetwork=true
await run(()=>root.root.findAllByType('button')[1].props.onClick())
assert.equal(root.root.findAllByType(QRCodeSVG).length,0)
assert.match(JSON.stringify(root.toJSON()),/Receiving details are unavailable/)
await run(()=>root.unmount())
console.log('Receive UI passed: two rails, correct QR/address pairing, chain-specific notices and account-switch isolation.')
