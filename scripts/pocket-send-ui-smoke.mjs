import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {getAddress,isAddress,parseUnits,zeroAddress} from 'viem'
const source=fs.readFileSync('src/components/StreamPaySend.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
let resolveRecipient,finishSend,sends=0
const wallet={address:'0x1111111111111111111111111111111111111111',session:{},balanceReady:true,balance:'2',sendUsdc:async()=>{sends++;return new Promise(resolve=>finishSend=resolve)}}
const account={resolvePocketId:async()=>new Promise(resolve=>resolveRecipient=resolve),recordTransfer:async()=>{throw Error('Activity offline')}}
const context={exports:{},React,...React,getAddress,isAddress,parseUnits,zeroAddress,usePrivy:()=>({authenticated:true,user:{id:'owner'}}),useStreamAccount:()=>account,useCircleWallet:()=>wallet,useStreamPayPath:p=>p,formatUsdcBalance:()=>'',readPendingTransfer:()=>undefined,queueArcActivity(){},removeArcActivity(){},ArrowLeftIcon:()=>null,CheckCircleIcon:()=>null,AgreementSignInLanding:()=>null,Link:({children})=>children}
vm.runInNewContext(compiled,context)
let root
await act(async()=>{root=TestRenderer.create(React.createElement(context.exports.default))})
const input=()=>root.root.findAllByType('input')[0]
const button=label=>root.root.findAllByType('button').find(b=>b.children.includes(label))
await act(async()=>input().props.onChange({target:{value:'123456'}}))
await act(async()=>button('Verify').props.onClick())
await act(async()=>input().props.onChange({target:{value:'654321'}}))
await act(async()=>resolveRecipient({walletAddress:'0x2222222222222222222222222222222222222222',displayName:'OLD RECIPIENT'}))
assert.ok(!JSON.stringify(root.toJSON()).includes('OLD RECIPIENT'))
assert.equal(button('Confirm send').props.disabled,true)
await act(async()=>button('Verify').props.onClick())
await act(async()=>resolveRecipient({walletAddress:'0x3333333333333333333333333333333333333333',displayName:'Current recipient'}))
await act(async()=>root.root.findAllByType('input')[1].props.onChange({target:{value:'1'}}))
const send=button('Confirm send')
await act(async()=>{send.props.onClick();send.props.onClick()})
assert.equal(sends,1)
await act(async()=>finishSend('0x'+'a'.repeat(64)))
assert.ok(JSON.stringify(root.toJSON()).includes('USDC sent'),'Activity outage must not reverse a verified success')
await act(async()=>root.unmount())
console.log('Pocket recipient edit race, duplicate taps and confirmed success during Activity outage passed.')
