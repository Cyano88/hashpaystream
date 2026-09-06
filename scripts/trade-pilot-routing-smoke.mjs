import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const directory=await mkdtemp(path.join(tmpdir(),'trade-routing-'))
const oldWindow=globalThis.window
try{
 for(const pilot of ['', 'https://hashpaystream-trade-pilot.onrender.com']){
  const calls=[]
  globalThis.window={location:{href:'https://hashpaystream.app/trade',origin:'https://hashpaystream.app'},fetch:async()=>new Response('passthrough'),nativeRequest:async options=>{calls.push(options);return {data:{ok:true},status:200,headers:{}}}}
  const result=await build({entryPoints:['src/lib/nativeApiTransport.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.VITE_HASHPAYSTREAM_TRADE_API_ORIGIN':JSON.stringify(pilot)},plugins:[{name:'native',setup(b){b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'native',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const Capacitor={isNativePlatform:()=>true};export const CapacitorHttp={request:options=>window.nativeRequest(options)}'}))}}]})
  const file=path.join(directory,pilot?'pilot.mjs':'normal.mjs');await writeFile(file,result.outputFiles[0].text)
  const {installNativeApiTransport}=await import(pathToFileURL(file));installNativeApiTransport()
  await window.fetch('/api/hashpaystream/v1/trade/listings')
  await window.fetch('/api/hashpaystream/v1/requests')
  await window.fetch('/api/hashpaystream/staging/agreements/example/receipts')
  assert.equal(calls[0].url,(pilot||'https://hashpaystream.onrender.com')+'/api/hashpaystream/v1/trade/listings')
  assert.ok(calls.slice(1).every(call=>call.url.startsWith('https://hashpaystream.onrender.com/')))
  assert.equal(await (await window.fetch('https://example.com/image')).text(),'passthrough')
 }
 console.log('Trade pilot routing passed: only Trade changes origin; payments/receipts and normal builds retain their backend.')
}finally{globalThis.window=oldWindow;if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('trade-routing-'))throw Error('Invalid cleanup path');await rm(directory,{recursive:true,force:true})}
