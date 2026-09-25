import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createHashPayStreamAgreementGateway } from '../api/agreement-gateway.ts'
const secret='fixture-ownership-secret-with-32-characters'
const liveKey='hpl_app_'+'a'.repeat(64), testKey='hpl_test_'+'b'.repeat(64)
const env={HASHPAYSTREAM_HUMAN_AGREEMENT_ENVIRONMENT:'live',HASHPAYSTREAM_ARC_MAINNET_API_KEY:liveKey,HASHPAYSTREAM_ARC_API_KEY:testKey,HASHPAYSTREAM_APP_OWNERSHIP_SECRET:secret,HASHPAYSTREAM_HASH_PAYLINK_BASE_URL:'https://app.hashpaylink.com',HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY:'legacy-owner-store',HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY:'legacy-events'}
const id='agr_mainnetfixture1234', reads=[],events=[],calls=[]
let populated=false
const owner=createHmac('sha256',secret).update('hashpaystream.owner\0owner-a').digest('hex')
const oldFetch=globalThis.fetch
const handler=createHashPayStreamAgreementGateway({env:()=>env,hasStore:()=>true,identity:async req=>req.headers.authorization,logError:()=>{},read:async key=>{reads.push(key);return populated?{schema:1,idempotency:{},agreements:{[id]:{agreementId:id,ownerHash:owner,createdAt:'2026-09-24T00:00:00Z',updatedAt:'2026-09-24T00:00:00Z'}}}:undefined},readEvents:async key=>{events.push(key);return undefined},mutate:async()=>{throw Error('No mutations allowed')}})
globalThis.fetch=async(url,options)=>{calls.push({url,options});assert.equal(options.headers['x-api-key'],liveKey);return new Response(JSON.stringify({ok:true,agreements:[{id,checkoutMode:'human',status:'awaiting_start'}]}),{status:200,headers:{'content-type':'application/json'}})}
async function call(method='GET',user='owner-a',query={}){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method,headers:{authorization:user},query,body:{}},res);return res}
try{
let r=await call();assert.equal(r.statusCode,200);assert.deepEqual(r.body.agreements,[]);assert.equal(calls.length,0)
assert.deepEqual(reads,['hashpaystream:arc-mainnet:5042:human-agreement-owners:v1']);assert.deepEqual(events,['hashpaystream:arc-mainnet:5042:arc-webhooks:v1'])
populated=true;r=await call();assert.equal(r.statusCode,200);assert.equal(r.body.agreements[0].id,id);assert.equal(calls.length,1)
r=await call('GET','other-user');assert.deepEqual(r.body.agreements,[]);assert.equal(calls.length,1)
r=await call('GET','other-user',{id});assert.equal(r.statusCode,404);assert.equal(calls.length,1)
r=await call('POST');assert.equal(r.statusCode,503);assert.equal(calls.length,1)
for(const key of[undefined,testKey,'hpl_live_'+'a'.repeat(64)]){env.HASHPAYSTREAM_ARC_MAINNET_API_KEY=key;assert.equal((await call()).statusCode,503)}
env.HASHPAYSTREAM_ARC_MAINNET_API_KEY=liveKey;env.HASHPAYSTREAM_HUMAN_AGREEMENT_ENVIRONMENT='typo';assert.equal((await call()).statusCode,503)
console.log('Mainnet Agreement reads passed: dedicated scoped key, isolated ownership/events, no legacy fallback, owner-only reads and writes blocked pending wallet cutover.')
}finally{globalThis.fetch=oldFetch}
