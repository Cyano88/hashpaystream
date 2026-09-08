import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {formatUnits,getAddress,isAddress,parseUnits,zeroAddress} from 'viem'
const source=fs.readFileSync('src/components/StreamPaySend.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
let resolveRecipient,finishSend,sends=0
const wallet={address:'0x1111111111111111111111111111111111111111',session:{},balanceReady:true,balance:'2',sendUsdc:async()=>{sends++;return new Promise(resolve=>finishSend=resolve)}}
const account={resolvePocketId:async()=>new Promise(resolve=>resolveRecipient=resolve),recordTransfer:async()=>{throw Error('Activity offline')}}
const transfers={ready:true, available:(_,units)=>units, begin:async()=>({transfer:{id:'payment-one',status:'awaiting_approval'},releaseDraft(){}}),track:async()=>{throw Error('Status write offline')}}
const context={exports:{},React,...React,formatUnits,getAddress,isAddress,parseUnits,zeroAddress,usePrivy:()=>({authenticated:true,user:{id:'owner'}}),useStreamAccount:()=>account,useCircleWallet:()=>wallet,usePocketTransfers:()=>transfers,useStreamPayPath:p=>p,formatUsdcBalance:()=>'',readPendingTransfer:()=>undefined,queueArcActivity(){},removeArcActivity(){},ArrowLeftIcon:()=>null,CheckCircleIcon:()=>null,AgreementSignInLanding:()=>null,Link:({children})=>children}
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
await act(async()=>finishSend({hash:'0x'+'a'.repeat(64),accepted:true}))
assert.ok(JSON.stringify(root.toJSON()).includes('Transfer processing'),'Submission is processing, never premature success')
assert.ok(!JSON.stringify(root.toJSON()).includes('USDC sent'))
await act(async()=>button('Wallet address').props.onClick())
await act(async()=>input().props.onChange({target:{value:'0x4444444444444444444444444444444444444444'}}))
await act(async()=>root.root.findAllByType('input')[1].props.onChange({target:{value:'0.5'}}))
assert.equal(button('Confirm send').props.disabled,false,'Another payment is available while the first is processing')
await act(async()=>button('Confirm send').props.onClick())
assert.equal(sends,2)
await act(async()=>finishSend({hash:'0x'+'b'.repeat(64),accepted:true}))
await act(async()=>root.unmount())
console.log('Pocket recipient edit race, duplicate taps and nonblocking submission during status-write outage passed.')
