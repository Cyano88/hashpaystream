import assert from 'node:assert/strict'
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import TestRenderer,{act} from 'react-test-renderer'
import {chooseTradePayment,tradePaymentChoice} from '../src/lib/tradePaymentChoice.ts'
const source=fs.readFileSync('src/components/TradePaymentPicker.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
let pending=[],changed,available
const context={exports:{},React,...React,chooseTradePayment,tradePaymentChoice,StreamSelect:props=>React.createElement('picker',props),communityRequest:()=>new Promise(resolve=>pending.push(resolve))}
vm.runInNewContext(compiled,context)
const props={terms:{currency:'USDC',price:'25',deliveryFee:'0'},onChange:value=>changed=value,onAvailability:value=>available=value,getAccessToken:async()=> 'fixture',disabled:false}
const result=(arc,xlayer)=>({arc:{chainId:5042,enabled:arc},xlayer:{chainId:196,enabled:xlayer}})
let renderer;await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default,props))})
assert.equal(renderer.root.findByType('picker').props.disabled,true);assert.equal(renderer.root.findByProps({'aria-label':'Checking payment networks'}).props.role,'status')
const old=pending.shift();await act(async()=>{renderer.update(React.createElement(context.exports.default,{...props,getAccessToken:async()=> 'different-account'}))})
await act(async()=>old(result(true,true)));assert.equal(available.arc,false,'stale account must not restore availability')
await act(async()=>pending.shift()(result(false,true)))
let picker=renderer.root.findByType('picker');assert.equal(picker.props.options.find(o=>o.value==='arc').disabled,true);assert.equal(picker.props.value,'legacy');assert.throws(()=>picker.props.onChange('arc'))
await act(async()=>picker.props.onChange('xlayer'));assert.equal(changed.price,'');assert.equal(props.terms.price,'25')
await act(async()=>renderer.root.findByType('button').props.onClick());await act(async()=>pending.shift()(result(true,true)))
picker=renderer.root.findByType('picker');await act(async()=>picker.props.onChange('arc'));assert.equal(changed.paymentRail,'arc');assert.equal(changed.price,'')
await act(async()=>renderer.unmount())
console.log('Trade payment picker passed: loading shimmer, unavailable rails, stale response isolation and clearing cross-network quantities.')
