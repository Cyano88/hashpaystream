import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {formatUnits,parseUnits,isAddress,toHex} from 'viem'
const source=fs.readFileSync('src/components/StockEmployerFunding.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const address=n=>'0x'+String(n).repeat(40), now=Math.floor(Date.now()/1000)
const e={id:'0x'+'11'.repeat(32),employer:address(1),worker:address(2),available:'50000000',payAt:now+86400,approved:false,title:'Test earned work'}
const config={version:1,chainId:1952,escrow:address(3),usdc:address(4),asset:address(5),maxFeeBps:300,confirmations:2}
let writes=0,prepares=0,drafts=[]
const api=async body=>{
 if(!body)return {config,now,paused:false,earnings:[e],drafts}
 if(body.action==='prepare_funding'){prepares++;drafts=[{id:'0x'+'22'.repeat(32),...body,employer:address(1)}];return {draft:drafts[0]}}
 throw Error('Unexpected API call')
}
const context={exports:{},React,...React,formatUnits,parseUnits,isAddress,toHex,Date,crypto:globalThis.crypto,localStorage:{},EXPECTED_STOCK_ESCROW:config.escrow,
 useStockPaymentSession:()=>({api,wallet:()=>({address:address(1)}),userId:'test'}),
 performStockEarnings:async input=>{assert.equal(input.acceptedIrrevocable,true);assert.equal(input.operation,'approveEarnings');writes++},
 recoverStockEarnings:async()=>{},stockEarningsPendingKey:()=> 'pending'}
vm.runInNewContext(compiled,context)
let r
await act(async()=>{r=TestRenderer.create(React.createElement(context.exports.default))})
const button=label=>r.root.findAllByType('button').find(b=>b.children.includes(label))
assert.equal(button('Approve earned payment').props.disabled,true)
const checkbox=()=>r.root.findAllByType('input').find(i=>i.props.type==='checkbox')
await act(async()=>checkbox().props.onChange({target:{checked:true}}))
assert.equal(button('Approve earned payment').props.disabled,false)
e.available='49000000'
await act(async()=>button('Refresh').props.onClick())
assert.equal(button('Approve earned payment').props.disabled,true,'Changed amount requires new acknowledgement')
await act(async()=>checkbox().props.onChange({target:{checked:true}}))
const click=button('Approve earned payment').props.onClick
await act(async()=>{click();click()})
assert.equal(writes,1)
const inputs=r.root.findAllByType('input').filter(i=>i.props.type!=='checkbox')
for(const [i,value] of ['New work',address(2),'10','2099-01-01T12:00'].entries())await act(async()=>inputs[i].props.onChange({target:{value}}))
await act(async()=>button('Review funding').props.onClick())
assert.equal(prepares,1);assert.equal(writes,1,'Review must not send a wallet transaction')
assert.ok(button('Fund these earnings'))
await act(async()=>r.unmount())
console.log('Employer UI passed: explicit irrevocable approval, changed-terms consent, duplicate clicks and review without payment.')
