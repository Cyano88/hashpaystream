import assert from 'node:assert/strict'
import express from 'express'
import {createHmac} from 'node:crypto'
import {createTradeCommunityRouter} from '../api/trade-community.ts'
const secret='fixture-ownership-secret-'.repeat(3),thread='11111111-1111-4111-8111-111111111111',offer='22222222-2222-4222-8222-222222222222'
let enabled=true,linked=true,mode='hosted',calls=[],remoteCalls=0,reservation
const owner=createHmac('sha256',secret).update('hashpaystream.trade\0did:privy:local').digest('hex')
const store={hostedCheckout:async(viewer,t,o,account,reserve)=>{assert.equal(viewer,owner);assert.equal(t,thread);assert.equal(o,offer);calls.push({account,reserve});return {mode,reservation,ready:!!account,buyerReady:!!account,sellerReady:false}}}
const app=express();app.use('/trade',createTradeCommunityRouter({env:()=>({HASHPAYSTREAM_TRADE_ENABLED:'true',HASHPAYSTREAM_TRADE_HOSTED_ENABLED:enabled?'true':'false',HASHPAYSTREAM_TRADE_OWNERSHIP_SECRET:secret}),identity:async req=>{if(req.headers.authorization!=='Bearer fixture')throw Object.assign(Error('Sign in'),{status:401});return 'did:privy:local'},store:()=>store,hostedAccount:async(user)=>{assert.equal(user,'did:privy:local');return linked?{hashPayLinkUserId:'did:privy:verified',walletAppId:'fixture-app',subject:'fixture',linkedAt:1}:undefined},hostedCheckout:async()=>{remoteCalls++;return {checkoutUrl:'https://app.hashpaylink.com/agreements/xstocks/xag_'+'a'.repeat(64),state:2}}}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
async function call(action,extra={},auth='Bearer fixture'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/trade/hosted-checkout',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({threadId:thread,offerId:offer,action,...extra})});return {status:r.status,body:await r.json()}}
try{
 assert.equal((await call('status',{},'wrong')).status,401);assert.equal(calls.length,0)
 assert.equal((await call('fund')).status,400)
 enabled=false;assert.equal((await call('status')).body.enabled,false);assert.equal(remoteCalls,0)
 enabled=true;linked=false;assert.equal((await call('connect')).body.needsConnection,true)
 linked=true;await call('connect',{hashPayLinkUserId:'did:privy:forged',address:'0x'+'77'.repeat(20)});assert.equal(calls.at(-1).account.hashPayLinkUserId,'did:privy:verified')
 reservation={kind:'hosted-trade-v1'};enabled=false;assert.equal((await call('status')).body.state,2);assert.equal(remoteCalls,1,'Existing hosted recovery remains reachable with new Trade disabled')
 mode='legacy';assert.equal((await call('status')).body.mode,'legacy');assert.equal(remoteCalls,1)
 console.log('Hosted Trade HTTP passed: authentication, server-owned participants, explicit actions, default-off rollout and existing recovery routing.')
}finally{await new Promise(r=>server.close(r))}
