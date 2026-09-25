import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const file=path.resolve('output/playwright/app-access-fixture.mjs');
await mkdir(path.dirname(file),{recursive:true});
const result=await build({stdin:{contents:"export {default} from './src/App.tsx'",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'app-access-fixture',setup(b){
 b.onResolve({filter:/.*/},a=>{
  if(['react','react/jsx-runtime'].includes(a.path)||a.path==='./src/App.tsx'||a.path==='./components/CircleWalletGate')return;
  return {path:a.path,namespace:'fixture'};
 });
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>{
  let contents='';
  if(a.path.endsWith('.css'))contents='';
  else if(a.path==='@privy-io/react-auth')contents='export const usePrivy=()=>globalThis.accessFixture.auth';
  else if(a.path==='@capacitor/core')contents='export const Capacitor={isNativePlatform:()=>false}';
  else if(a.path.endsWith('/circleWallet'))contents='export const useCircleWallet=()=>globalThis.accessFixture.wallet';
  else if(a.path.endsWith('/ThemeContext'))contents='export const useThemeSurface=()=>{}';
  else if(a.path.endsWith('/arcWalletConfig'))contents="export const ARC_WALLET_APP_ID='fixture'";
  else if(a.path.endsWith('/fetchWithTimeout'))contents="export const fetchWithTimeout=()=>{throw Error('Unexpected network access')}";
  else if(a.path.endsWith('/circleSession'))contents='export const clearPersistedCircleSession=async()=>{}';
  else if(a.path==='@hashpaylink/sdk/wallet')contents="import React from 'react';export const CircleWalletAccessScreen=()=>React.createElement('circle-access')";
  else if(a.path.endsWith('/router'))contents="import React from 'react';export const useLocation=()=>({pathname:globalThis.accessFixture.route,search:''});export const useNavigate=()=>()=>{};export const Navigate=({to})=>React.createElement('redirect',{to});export const BrowserRouter=({children})=>children";
  else if(a.path.endsWith('/useStreamPayPath'))contents='export const useStreamPayPath=x=>x';
  else if(a.path.endsWith('/useHashPayStreamSessionSplash'))contents="export const useHashPayStreamSessionSplash=()=> 'idle'";
  else if(a.path.endsWith('/HashPayStreamSessionSplash'))contents='export const HashPayStreamSessionSplash=()=>null';
  else if(a.path.endsWith('/StreamPayLayout'))contents="import React from 'react';export const StreamPayLayout=({children})=>React.createElement('app-layout',null,children)";
  else contents=`import React from 'react';export default function Page(){return React.createElement('product-page',{name:${JSON.stringify(a.path)}})}`;
  return {contents,loader:'js'};
 });
}}]});
await writeFile(file,result.outputFiles[0].text);
const originals={window:globalThis.window,document:globalThis.document};
globalThis.window={setTimeout:()=>0,clearTimeout:()=>{},location:{reload(){}}};globalThis.document={title:''};
const noop=()=>{};
const routes=['/home','/trade','/swap','/xstocks','/agreements','/agreements/new','/upfront','/upfront/funding','/funding','/savings','/move','/move/xlayer/send','/send','/receive','/activity','/notifications','/requests','/account','/operations','/admin/analytics'];
try{
 const {default:App}=await import(pathToFileURL(file).href);
 for(const route of routes)for(const stage of ['email-loading','signed-out','idle','restoring','verifying','error','ready']){
  globalThis.accessFixture={route,auth:{ready:stage!=='email-loading',authenticated:!['email-loading','signed-out'].includes(stage),user:{id:'fixture',email:{address:'fixture@example.invalid'}},getAccessToken:async()=>null,logout:async()=>{}},wallet:{state:['restoring','verifying'].includes(stage)?'connecting':['idle','error','ready'].includes(stage)?stage:'ready',stage,error:'',reconnect:noop,reauthorize:noop}};
  let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(App))});
  const pages=tree.root.findAllByType('product-page'),layouts=tree.root.findAllByType('app-layout');
  if(stage==='signed-out'){assert.equal(pages.length,0,route);assert.equal(layouts.length,0,route+' hides app shell before email sign-in');assert.equal(tree.root.findByType('redirect').props.to,'/',route)}
  else if(stage!=='ready'){assert.equal(pages.length,0,route+' blocked at '+stage);assert.equal(layouts.length,0,route+' hides app shell at '+stage)}
  else assert.equal(layouts.length,1,route+' available after Circle ready');
  await act(async()=>tree.unmount());
 }
 console.log('App access passed: 20 product routes x 7 email/Circle states. Pending/error sessions never mount product screens; verified sessions enter the shared layout.');
}finally{for(const [key,value]of Object.entries(originals))globalThis[key]=value;delete globalThis.accessFixture;await unlink(file)}
