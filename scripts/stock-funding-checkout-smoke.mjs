import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import { formatUnits } from 'viem'
import * as policy from '../src/lib/stockFundingOffers.ts'
const source=fs.readFileSync('src/components/StockFundingCheckout.tsx','utf8').replace(/^\uFEFF/,'').replace(/^import .*\r?\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
let now=1000, confirms=0, finish
const context={exports:{},React,...React,...policy,formatUnits,formatUsdcBalance:units=>formatUnits(BigInt(units),6)+' USDC',FundingOfferSelector:props=>React.createElement('selector',props,props.children),Date:class extends Date {static now(){return now*1000}},window:{setInterval:()=>1,clearInterval(){}}}
vm.runInNewContext(compiled,context)
const asset='0x1111111111111111111111111111111111111111'
const offer={id:'o1',funderId:'f1',funderName:'Funder',asset,chainId:196,tokenUnits:'2000000',principalUsdcUnits:'100000000',feeBps:100,repayAt:2000,expiresAt:1060}
const riskPolicy={chainId:196,asset,assetSymbol:'TESTx',assetDecimals:6,maxFeeBps:300,maxVolatilityBps:400,minExecutableLiquidityUsdcUnits:'500000000',maxPriceAgeSeconds:60,maxQuoteDeviationBps:50}
const evidence={asset,observedAt:990,eligibleUntil:1040,volatilityBps:200,executableLiquidityUsdcUnits:'1000000000',referenceValueUsdcUnits:'100000000',tokenUnits:'2000000',tradingAvailable:true,transfersAvailable:true,issuerEligible:true}
const props={offers:[offer],contexts:{o1:{repayAt:2000,requestedPrincipalUsdcUnits:'100000000',unreservedEarningsUsdcUnits:'110000000',inventoryTokenUnits:'2000000',funderApproved:true,workerEligible:true,policy:riskPolicy,evidence}},verifiedCompletedFundingCounts:{f1:3},onRefresh:async()=>{},onConfirm:async()=>{confirms++;await new Promise(resolve=>{finish=resolve})}}
let renderer
await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default,props))})
const checkbox=()=>renderer.root.findByType('input')
const confirm=()=>renderer.root.findAllByType('button').find(x=>x.children.includes('Confirm stock payment')||x.children.includes('Confirming payment...'))
assert.equal(confirm().props.disabled,true)
assert.ok(renderer.root.findAllByType('p').some(p=>p.children.join('').includes('2 TESTx')))
await act(async()=>checkbox().props.onChange({target:{checked:true}}))
assert.equal(confirm().props.disabled,false)
await act(async()=>renderer.update(React.createElement(context.exports.default,{...props,offers:[{...offer,feeBps:200}]})))
assert.equal(confirm().props.disabled,true,'Changing terms must require fresh consent')
await act(async()=>checkbox().props.onChange({target:{checked:true}}))
const click=confirm().props.onClick
await act(async()=>{click();click()})
assert.equal(confirms,1,'Repeated clicks must not submit twice')
await act(async()=>finish())
assert.equal(confirm().props.disabled,true)
await act(async()=>checkbox().props.onChange({target:{checked:true}}))
now=1100
await act(async()=>confirm().props.onClick())
assert.equal(confirms,1,'Expiry must be checked immediately before calling the adapter')
assert.equal(renderer.root.findAll(x=>x.props.role==='alert').length,1)
now=1000
await act(async()=>renderer.update(React.createElement(context.exports.default,{...props,offers:[{...offer,id:'o2'}],contexts:{o2:props.contexts.o1}})))
assert.equal(renderer.root.findByType('selector').props.selectedId,'o1','An unavailable choice must never silently switch to another offer')
await act(async()=>renderer.unmount())
console.log('Stock checkout passed: exact token display, consent, changed terms, duplicate clicks, expiry and no silent substitution.')
