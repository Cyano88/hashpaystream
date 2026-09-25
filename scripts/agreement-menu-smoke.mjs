import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
const output=path.resolve('output/playwright/agreement-menu-fixture.mjs')
const mocks={
 auth:'export const usePrivy=()=>globalThis.__agreementAuth',
 router:"import React from 'react'; export const useLocation=()=>({search:globalThis.__agreementSearch}); export const useNavigate=()=>globalThis.__agreementNavigate; export const Link=({to,children,...props})=>React.createElement('a',{...props,href:to},children)",
 requests:'export const useServiceRequests=()=>globalThis.__agreementRequests',
 stub:'export default function Stub(){return null}; export const AgreementSignInLanding=Stub; export const LoadingRing=Stub; export const StreamPayLoadingState=Stub',
}
const result=await build({entryPoints:['src/components/agreements/AgreementDashboard.tsx'],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env':'{}'},jsx:'automatic',external:['react'],plugins:[{name:'agreement-fixture',setup(b){
 b.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'auth',namespace:'fixture'}))
 b.onResolve({filter:/\/router$/},()=>({path:'router',namespace:'fixture'}))
 b.onResolve({filter:/\/serviceRequests$/},()=>({path:'requests',namespace:'fixture'}))
 b.onResolve({filter:/\/(UnifiedReceipt|AgreementSignInLanding|LoadingRing|StreamPayLoadingState|StreamPayFundRequest|EarlyPaySettlementSummary|SubmittedWorkLink)$/},()=>({path:'stub',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path],loader:'js'}))
}}]})
await fs.writeFile(output,result.outputFiles[0].text)
const originals={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch}
globalThis.window={setInterval,clearInterval,setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:true}),scrollTo(){}}
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}}
globalThis.__agreementAuth={ready:true,authenticated:true,user:{id:'fixture-user'},getAccessToken:async()=> 'synthetic'}
globalThis.__agreementRequests={requests:[],loading:false,error:'',refresh:async()=>{}}
globalThis.__agreementSearch='?app=pocket&src=telegram'
let destination='';globalThis.__agreementNavigate=to=>{destination=to}
const agreements=[{id:'ongoing-id',title:'Ongoing fixture',status:'active',amount:'20',updatedAt:'2026-09-23T00:00:00Z',chain:null,releaseRequest:null},{id:'closed-id',title:'Completed fixture',status:'completed',amount:'30',updatedAt:'2026-09-22T00:00:00Z',chain:null,releaseRequest:null}]
globalThis.fetch=async url=>new Response(JSON.stringify({ok:true,agreements:String(url).includes('/upfront/')?[]:agreements}))
let root
try{
 const {default:Dashboard}=await import(pathToFileURL(output).href)
 const render=async search=>{globalThis.__agreementSearch=search;await act(async()=>{if(root)root.update(React.createElement(Dashboard));else root=TestRenderer.create(React.createElement(Dashboard))})}
 const label=n=>n.children.map(c=>typeof c==='string'?c:label(c)).join('')
 const button=text=>root.root.findAllByType('button').find(n=>label(n)===text)
 await render(globalThis.__agreementSearch)
 assert.equal(root.root.findByType('h1').children.join(''),'Agreements')
 assert.match(root.root.findAllByType('a').find(n=>label(n).includes('Start new agreement')).props.href,/compose=1&from=agreements&app=pocket&src=telegram/)
 assert.ok(button('OngoingTrack work and payments in progress'))
 await act(async()=>button('OngoingTrack work and payments in progress').props.onClick())
 assert.equal(destination,'/agreements?section=ongoing&app=pocket&src=telegram')
 await render(destination.slice(destination.indexOf('?')))
 assert.equal(root.root.findByType('h1').children.join(''),'Ongoing')
 assert.ok(JSON.stringify(root.toJSON()).includes('Ongoing fixture'))
 assert.ok(!JSON.stringify(root.toJSON()).includes('Completed fixture'))
 const row=root.root.findAllByType('button').find(n=>label(n).startsWith('Ongoing fixture'))
 await act(async()=>row.props.onClick())
 assert.match(destination,/section=ongoing&agreementId=ongoing-id/)
 await render(destination.slice(destination.indexOf('?')))
 await act(async()=>root.root.findByProps({'aria-label':'Back to agreements'}).props.onClick())
 assert.equal(destination,'/agreements?section=ongoing&app=pocket&src=telegram')
 await render('?section=completed&app=pocket&src=telegram')
 assert.equal(root.root.findByType('h1').children.join(''),'Completed')
 assert.ok(JSON.stringify(root.toJSON()).includes('Completed fixture'))
 assert.ok(!JSON.stringify(root.toJSON()).includes('Ongoing fixture'))
 await render('?app=pocket&src=telegram')
 assert.equal(root.root.findByType('h1').children.join(''),'Agreements')
 console.log('Agreement menu navigation passed: section filtering, detail/back, browser route changes and app context.')
}finally{if(root)await act(async()=>root.unmount());Object.assign(globalThis,originals);for(const key of ['__agreementAuth','__agreementRequests','__agreementSearch','__agreementNavigate'])delete globalThis[key];await fs.unlink(output)}
