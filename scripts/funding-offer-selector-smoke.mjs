import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { rankFundingOffers } from '../src/lib/stockFundingOffers.ts'
const source = fs.readFileSync('src/components/FundingOfferSelector.tsx','utf8').replace(/^\uFEFF/,'').replace(/^import .*\r?\n/gm,'')
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const listeners = new Map()
let restored = false
const context = { exports:{}, React,...React,rankFundingOffers,createPortal:child=>child,CheckIcon:()=>null,ChevronDownIcon:()=>null,
  document:{body:{style:{overflow:'auto'}},activeElement:{focus(){restored=true}}},
  window:{requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)} }
vm.runInNewContext(compiled,context)
const selected=[]
const offers=[{id:'cheap',name:'New Funder',feeBps:50,feeLabel:'0.5 USDC',verifiedCompletedFundingCount:1},{id:'best',name:'Established Funder',feeBps:100,feeLabel:'1 USDC',verifiedCompletedFundingCount:20}]
let renderer
await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default,{offers,selectedId:'best',onSelect:id=>selected.push(id)}))})
assert.equal(selected.length,0)
assert.ok(JSON.stringify(renderer.toJSON()).includes('Best offer available'))
let open=renderer.root.findAllByType('button').find(x=>x.children.includes('See other eligible offers'))
await act(async()=>open.props.onClick())
assert.equal(context.document.body.style.overflow,'hidden')
const choices=renderer.root.findAllByType('button').filter(x=>'aria-pressed' in x.props)
assert.equal(choices.length,2)
assert.equal(choices[0].props['aria-pressed'],true)
await act(async()=>choices[1].props.onClick())
assert.deepEqual(selected,['cheap'])
assert.equal(renderer.root.findAll(x=>x.props.role==='dialog').length,0)
assert.equal(context.document.body.style.overflow,'auto')
assert.equal(restored,true)
await act(async()=>open.props.onClick())
await act(async()=>listeners.get('keydown')({key:'Escape',preventDefault(){}}))
assert.equal(renderer.root.findAll(x=>x.props.role==='dialog').length,0)
assert.equal(selected.length,1,'Closing the sheet must not choose or submit an offer')
await act(async()=>renderer.unmount())
console.log('Funding sheet passed: ranking, local-only choice, close, Escape and focus restoration.')
