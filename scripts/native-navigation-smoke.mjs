import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
const file=path.resolve('output/playwright/native-navigation-fixture.mjs')
await mkdir(path.dirname(file),{recursive:true})
const result=await build({stdin:{contents:"export {useHashPayStreamSessionSplash} from './src/lib/useHashPayStreamSessionSplash';export {initializeNativeApp} from './src/lib/nativeApp'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',external:['react'],plugins:[{name:'native-fixture',setup(b){b.onResolve({filter:/^@capacitor\//},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const Capacitor={isNativePlatform:()=>true};export const SystemBars={setStyle:async()=>{},show:async()=>{}};export const SystemBarsStyle={Dark:'dark',Light:'light'};export const SystemBarType={StatusBar:'status'};export const StatusBar={setStyle:async()=>{},setOverlaysWebView:async()=>{},setBackgroundColor:async({color})=>{globalThis.statusBarColor=color}};export const Style={Dark:'dark',Light:'light'};export const App={addListener:async(name,fn)=>{globalThis.nativeListeners[name]=fn;return{remove(){}}},minimizeApp:()=>{globalThis.minimized=true}};export const Keyboard=App;export const Browser={open:async()=>{}};`,loader:'js'}))}}]})
await writeFile(file,result.outputFiles[0].text)
const originals={window:globalThis.window,document:globalThis.document,MutationObserver:globalThis.MutationObserver,PopStateEvent:globalThis.PopStateEvent}
let timers=new Map(),counter=0,historyCalls=[],events=[]
globalThis.nativeListeners={}
globalThis.window={sessionStorage:{getItem:()=>null,setItem(){}},performance:{getEntriesByType:()=>[]},matchMedia:()=>({matches:false}),setTimeout:fn=>{const id=++counter;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),addEventListener(){},removeEventListener(){},dispatchEvent:e=>events.push(e.type),location:{pathname:'/trade',replace(){throw Error('Unexpected document reload')}},history:{back:()=>historyCalls.push('back'),replaceState:(_,__,url)=>historyCalls.push(url)}}
globalThis.document={documentElement:{dataset:{},classList:{contains:()=>false}},addEventListener(){},removeEventListener(){}}
globalThis.MutationObserver=class {observe(){} disconnect(){}}
globalThis.PopStateEvent=class {constructor(type){this.type=type}}
try{
 const {useHashPayStreamSessionSplash:useSplash,initializeNativeApp}=await import(pathToFileURL(file).href)
 function Probe({enabled}){return React.createElement('state',{value:useSplash(enabled,true)})}
 let tree
 await act(async()=>{tree=TestRenderer.create(React.createElement(Probe,{enabled:true}))})
 assert.equal(tree.root.findByType('state').props.value,'entering')
 for(const expected of ['mark','assembling','holding','launching','idle']){await act(async()=>{const batch=[...timers.values()];timers.clear();batch.forEach(fn=>fn())});assert.equal(tree.root.findByType('state').props.value,expected,'Keep a readable hold before the final fade')}
 assert.equal(tree.root.findByType('state').props.value,'idle')
 await act(async()=>tree.update(React.createElement(Probe,{enabled:false})))
 await act(async()=>tree.update(React.createElement(Probe,{enabled:true})))
 assert.equal(tree.root.findByType('state').props.value,'idle','Trade -> Home must not restart launch animation')
 await act(async()=>tree.unmount())
 await act(async()=>{tree=TestRenderer.create(React.createElement(Probe,{enabled:false}))})
 await act(async()=>tree.update(React.createElement(Probe,{enabled:true})))
 assert.equal(tree.root.findByType('state').props.value,'idle','Direct Trade -> Home must not animate as a new launch')
 await act(async()=>tree.unmount())
 const cleanup=initializeNativeApp()
 assert.equal(globalThis.statusBarColor,'#F5F5F7')
 document.documentElement.dataset.streamSystemSurface='dark';nativeListeners.appStateChange({isActive:true});assert.equal(globalThis.statusBarColor,'#0A0A0A')
 document.documentElement.dataset.streamThemeSurface='launch';nativeListeners.appStateChange({isActive:true});assert.equal(globalThis.statusBarColor,'#06070a')
 document.documentElement.dataset.streamThemeSurface='auth';document.documentElement.dataset.streamSystemSurface='light';nativeListeners.appStateChange({isActive:true});assert.equal(globalThis.statusBarColor,'#F5F5F7')
 nativeListeners.keyboardWillShow();assert.equal(document.documentElement.dataset.streamKeyboard,'open')
 nativeListeners.keyboardDidShow();assert.equal(document.documentElement.dataset.streamKeyboard,'open')
 nativeListeners.keyboardDidHide();assert.equal(document.documentElement.dataset.streamKeyboard,undefined)
 nativeListeners.backButton({canGoBack:false});assert.deepEqual(historyCalls,['/home']);assert.deepEqual(events,['hashpaystream:back','popstate'])
 nativeListeners.backButton({canGoBack:true});assert.deepEqual(historyCalls,['/home','back'])
 window.location.pathname='/home';nativeListeners.backButton({canGoBack:false});assert.equal(globalThis.minimized,true)
 const dispatch=window.dispatchEvent;window.dispatchEvent=e=>{e.preventDefault();return !e.defaultPrevented};const before=historyCalls.length;nativeListeners.backButton({canGoBack:true});assert.equal(historyCalls.length,before,'A dismissed overlay must consume Back');window.dispatchEvent=dispatch
 cleanup()
 console.log('Native launch, SPA back/history/minimize and keyboard visibility checks passed.')
}finally{for(const [key,value] of Object.entries(originals))globalThis[key]=value;delete globalThis.nativeListeners;delete globalThis.minimized;delete globalThis.statusBarColor;await unlink(file)}
