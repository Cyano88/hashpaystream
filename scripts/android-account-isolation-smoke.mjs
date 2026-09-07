import assert from 'node:assert/strict'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
const output = path.resolve('output/playwright/account-isolation-fixture.mjs')
await mkdir(path.dirname(output), { recursive: true })
const result = await build({stdin:{contents:"export {useStreamAccount} from './src/lib/streamAccount.ts';export {useAgreements} from './src/lib/useAgreements.ts'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',external:['react'],plugins:[{name:'synthetic-auth',setup(b){b.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'auth',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export function usePrivy(){return globalThis.__syntheticAuth}',loader:'js'}))}}]})
await writeFile(output,result.outputFiles[0].text)
const originalFetch=globalThis.fetch
const originalWindow=globalThis.window,originalDocument=globalThis.document
const pending=[]
globalThis.window={setInterval,clearInterval,setTimeout,clearTimeout}
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}}
globalThis.fetch=async (url,init)=>new Promise(resolve=>{assert.match(String(url),/^\/api\/hashpaystream\//);pending.push({token:init.headers.authorization,resolve})})
const auth=name=>({ready:true,authenticated:Boolean(name),user:name?{id:name}:undefined,getAccessToken:async()=>name?'synthetic-'+name:null})
const respond=async (item,data)=>act(async()=>{item.resolve(new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}}))})
try{
 const hooks=await import(pathToFileURL(output).href)
 for(const mode of ['account','agreements']){
  let view,root
  const Probe=()=>{view=mode==='account'?hooks.useStreamAccount(true):hooks.useAgreements();return null}
  const visible=()=>mode==='account'?view.profile?.displayName:view.agreements[0]?.title
  const data=name=>mode==='account'?{profile:{displayName:name},activity:[]}:{ok:true,agreements:[{id:name,title:name,status:'active',chain:null}]}
  globalThis.__syntheticAuth=auth('first-'+mode)
  await act(async()=>{root=TestRenderer.create(React.createElement(Probe))})
  await respond(pending.shift(),data('first'))
  assert.equal(visible(),'first')
  let late
  await act(async()=>{late=mode==='account'?view.refresh():view.reload()})
  const old=pending.shift()
  globalThis.__syntheticAuth=auth('second-'+mode)
  await act(async()=>root.update(React.createElement(Probe)))
  assert.equal(visible(),undefined,'Previous account data must disappear immediately')
  const current=pending.shift()
  await respond(old,data('late-first'))
  await late
  assert.equal(visible(),undefined,'Late prior-account response must be ignored')
  await respond(current,data('second'))
  assert.equal(visible(),'second')
  globalThis.__syntheticAuth=auth('')
  await act(async()=>root.update(React.createElement(Probe)))
  assert.equal(visible(),undefined,'Logout must clear visible account data')
  await act(async()=>root.unmount())
 }
 assert.equal(pending.length,0)
 console.log('Account and agreement isolation passed: identity switch, late response and logout.')
}finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.document=originalDocument;delete globalThis.__syntheticAuth;await unlink(output)}
