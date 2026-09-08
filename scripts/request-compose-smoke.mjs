import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
const source=fs.readFileSync('src/components/StreamPayRequests.tsx','utf8')
const form=source.slice(source.indexOf('function CreateRequest('),source.indexOf('function CounterRequest(')).replace('function CreateRequest(','export default function CreateRequest(')
const compiled=ts.transpileModule(form,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
let keyNumber=0
const context={exports:{},React,...React,inputClass:'',newKey:()=>`test-key-${++keyNumber}`,FormShell:({children})=>children,Field:({children})=>children,Duration:()=>null,StreamSelect:()=>null,ErrorMessage:({children})=>children}
vm.runInNewContext(compiled,context)
let release
const keys=[]
let root
await act(async()=>{root=TestRenderer.create(React.createElement(context.exports.default,{onBack(){},onCreate:async(_payload,key)=>{keys.push(key);if(keys.length===1)await new Promise(resolve=>release=resolve);throw Error('Response lost')}}))})
const submit=()=>root.root.findByType('form').props.onSubmit({preventDefault(){}})
let first
await act(async()=>{first=submit();void submit()})
assert.equal(keys.length,1,'Two rapid submits must send one request')
await act(async()=>{release();await first})
await act(async()=>{await submit()})
assert.equal(keys[0],keys[1],'Retry unchanged content with the same idempotency key')
await act(async()=>root.root.findAllByType('input')[1].props.onChange({target:{value:'Revised title'}}))
await act(async()=>{await submit()})
assert.notEqual(keys[1],keys[2],'Changed content is a distinct request intent')
await act(async()=>root.unmount())
console.log('Request compose blocks rapid duplicate submits and reuses the key after a lost response.')
