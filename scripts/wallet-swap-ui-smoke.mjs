import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
const source=fs.readFileSync('src/components/StreamPaySwap.tsx','utf8').replace(/^import .*\r?\n/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText
const requests=[],id='wss_'+'a'.repeat(64);let who='user-a',reply
const Icon=()=>React.createElement('i'),context={exports:{},React,...React,setTimeout,clearTimeout,usePrivy:()=>({authenticated:true,user:{id:who},getAccessToken:async()=>who}),useStreamPayPath:p=>p,Link:p=>React.createElement('a',{href:p.to},p.children),HostedAccountConnection:()=>React.createElement('div',null,'Connect account'),AgreementSignInLanding:()=>null,ArrowLeftIcon:Icon,ChevronRightIcon:Icon,CurrencyDollarIcon:Icon,ChartBarIcon:Icon,fetchWithTimeout:async(path,init)=>{requests.push({path,init});const {rail}=JSON.parse(init.body);return {ok:true,json:async()=>reply||{ok:true,rail,checkoutUrl:'https://app.hashpaylink.com/wallet/swap/'+id}}}}
vm.runInNewContext(code,context)
let renderer;const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default));await drain()})
const choice=name=>renderer.root.findAllByType('button').find(b=>JSON.stringify(b.children.map(c=>typeof c==='string'?c:typeof c.type==='string'?c.props.children:[])).includes(name))
const rows=renderer.root.findAllByType('button');assert.equal(rows.length,2)
await act(async()=>{rows[0].props.onClick();await drain()});assert.equal(JSON.parse(requests.at(-1).init.body).rail,'arc');assert.ok(renderer.root.findAllByType('a').some(a=>a.props.href==='https://app.hashpaylink.com/wallet/swap/'+id))
reply={ok:true,rail:'xlayer',checkoutUrl:'https://evil.example/swap'}
await act(async()=>{renderer.root.findAllByType('button')[1].props.onClick();await drain()});assert.equal(renderer.root.findAllByType('a').some(a=>a.props.href?.includes('evil')),false);assert.ok(renderer.root.findAll(p=>p.props.role==='alert').length)
reply={ok:true,needsConnection:true};await act(async()=>{renderer.root.findAllByType('button')[1].props.onClick();await drain()});assert.match(JSON.stringify(renderer.toJSON()),/Continue after connecting/)
who='user-b';await act(async()=>{renderer.update(React.createElement(context.exports.default));await drain()});assert.equal(renderer.root.findAllByType('a').filter(a=>a.props.target==='_blank').length,0,'Account switch clears the previous wallet link')
await act(async()=>renderer.unmount())
console.log('Swap UI passed: two network choices, shared hosted destination, unsafe-link rejection, account connection and account-switch isolation.')
