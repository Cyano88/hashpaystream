import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {formatUnits,parseUnits,getAddress} from 'viem'
import * as protocol from '../src/lib/stockEarlyPayProtocol.ts'
const source=fs.readFileSync('src/components/StockFunderDesk.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const addr=n=>'0x'+String(n).repeat(40),now=Math.floor(Date.now()/1000)
const config={version:1,chainId:1952,escrow:addr(1),asset:addr(2),usdc:addr(3),assetSymbol:'TESTx',assetDecimals:6,maxFeeBps:300,confirmations:2}
const offer={earningsId:'0x'+'11'.repeat(32),funder:addr(4),asset:config.asset,tokenAmount:'2000000',principal:'100000000',feeBps:100,payAt:now+86400,expiresAt:now+60,nonce:'0x'+'22'.repeat(32)}
let signed=0,published=0,prepared=0,issuerOpen=true
const api=async(body,query)=>{
 if(query?.view==='market_status')return {marketStatus:{status:'indicative',acceptanceAvailable:false,assetSymbol:'TESTx',tokenAmount:'1000000',amountOutUsdcUnits:'50000000',observedAt:now,expiresAt:now+15,issuerOpen}}
 if(!body)return {config,paused:false,inventory:'5000000',requests:[{id:'request',title:'Synthetic earnings',principal:offer.principal,payAt:offer.payAt}],offers:[{id:'0x'+'44'.repeat(32),requestId:'request',offer,published:true}]}
 if(body.action==='prepare_offer'){prepared++;return {config,offerId:'0x'+'33'.repeat(32),offer}}
 if(body.action==='publish_offer'){published++;return {ok:true}}
 throw Error('Unexpected mutation')
}
const context={exports:{},React,...React,...protocol,formatUnits,parseUnits,getAddress,Date,EXPECTED_STOCK_ESCROW:config.escrow,
 usePrivy:()=>({user:{id:'funder'}}),useStockPaymentSession:()=>({api,wallet:()=>({address:offer.funder}),userId:'funder'}),
 StockMarketStatus:props=>React.createElement('market-status',props),
 StockFunderOfferTerms:props=>React.createElement('terms',props),
 stockWalletClients:async()=>({account:offer.funder,walletClient:{signTypedData:async()=>{signed++;return '0x1234'}}})}
vm.runInNewContext(compiled,context)
let r
await act(async()=>{r=TestRenderer.create(React.createElement(context.exports.default))})
const button=label=>r.root.findAllByType('button').find(b=>b.children.includes(label))
await act(async()=>r.root.findByType('select').props.onChange({target:{value:'request'}}))
await act(async()=>r.root.findByType('terms').props.onFeeChange('1'))
assert.equal(button('Publish offer').props.disabled,true)
await act(async()=>button('Review current quote').props.onClick())
assert.equal(prepared,1);assert.equal(signed,0);assert.equal(published,0)
assert.ok(r.root.findAllByType('p').some(p=>p.children.join('').includes('You send 2 TESTx. You receive 101 USDC')))
assert.equal(button('Publish offer').props.disabled,true)
await act(async()=>r.root.findByType('terms').props.onRiskChange(true))
assert.equal(button('Publish offer').props.disabled,false)
const click=button('Publish offer').props.onClick
await act(async()=>{click();click()})
assert.equal(signed,1);assert.equal(published,1)
assert.equal(button('Publish offer').props.disabled,true)
await act(async()=>r.unmount())
issuerOpen=false
await act(async()=>{r=TestRenderer.create(React.createElement(context.exports.default))})
await act(async()=>r.root.findByType('select').props.onChange({target:{value:'request'}}))
assert.equal(button('Review current quote').props.disabled,true,'Closed stock session must disable new quote review')
assert.equal(r.root.findByType('terms').props.disabled,true,'Closed stock session must disable new offer terms')
assert.equal(button('Check / claim repayment').props.disabled,false,'Closed stock session must not disable existing repayment')
await act(async()=>r.unmount())
console.log('Funder desk passed: review does not sign, exact quote display, explicit consent, duplicate-click prevention and closed-session launch policy.')
