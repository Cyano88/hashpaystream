import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir,writeFile,unlink } from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const file=path.resolve('output/playwright/native-receipt-share-fixture.mjs')
await mkdir(path.dirname(file),{recursive:true})
const result=await build({entryPoints:['src/lib/nativeReceiptShare.ts'],bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'native-fixture',setup(b){b.onResolve({filter:/^@capacitor\//},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('/core')?'export const Capacitor={isNativePlatform:()=>globalThis.__receiptFixture.native}':args.path.endsWith('/filesystem')?'export const Directory={Cache:"CACHE"};export const Filesystem=globalThis.__receiptFixture.filesystem':'export const Share=globalThis.__receiptFixture.share',loader:'js'}))}}]})
await writeFile(file,result.outputFiles[0].text)
const writes=[],deletes=[],shares=[]
const fixture={native:false,filesystem:{readdir:async()=>({files:[{name:'old.pdf',type:'file',mtime:0},{name:'fresh.pdf',type:'file',mtime:Date.now()},{name:'../outside.pdf',type:'file',mtime:0}]}),deleteFile:async x=>deletes.push(x),writeFile:async x=>{writes.push(x);return {uri:'file:///cache/receipt-exports/receipt.pdf'}}},share:{share:async x=>shares.push(x)}}
globalThis.__receiptFixture=fixture
try{
 const {shareNativeReceipt}=await import(pathToFileURL(file).href)
 const pdf=new File(['%PDF-synthetic'], '../receipt.pdf',{type:'application/pdf'})
 assert.equal(await shareNativeReceipt(pdf),false);assert.equal(writes.length,0)
 fixture.native=true
 assert.equal(await shareNativeReceipt(pdf),true)
 assert.equal(Buffer.from(writes[0].data,'base64').toString(),'%PDF-synthetic')
 assert.equal(writes[0].directory,'CACHE');assert.match(writes[0].path,/^receipt-exports\/[a-f0-9-]+-[^/]+\.pdf$/)
 assert.deepEqual(deletes,[{path:'receipt-exports/old.pdf',directory:'CACHE'}])
 assert.deepEqual(shares[0].files,['file:///cache/receipt-exports/receipt.pdf'])
 await assert.rejects(shareNativeReceipt(new File(['x'],'x.html',{type:'text/html'})),/not supported/)
 fixture.share.share=async()=>{throw Error('NATIVE_SHARE_FAILED')}
 await assert.rejects(shareNativeReceipt(pdf),/NATIVE_SHARE_FAILED/)
 console.log('Native receipt share passed: cache-only files, exact bytes, safe cleanup, web fallback and failures.')
}finally{delete globalThis.__receiptFixture;await unlink(file)}
