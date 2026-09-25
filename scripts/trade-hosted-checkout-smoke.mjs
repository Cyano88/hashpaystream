import assert from 'node:assert/strict'
import {hostedTradeCheckout,hostedTradeAssets} from '../api/trade-hosted-checkout.ts'
const key='hpl_app_'+'a'.repeat(64),id='xag_'+'b'.repeat(64),token='0x'+'33'.repeat(20)
const env={HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY:key,HASHPAYSTREAM_TRADE_HOSTED_ENABLED:'true'}
const reservation={kind:'hosted-trade-v1',walletAppId:'fixture-app',idempotencyKey:'hashpaystream-trade-fixture-01',request:{kind:'trade',amount:'1.25',paymentToken:token,trade:{offerId:'fixture-offer',snapshotHash:'a'.repeat(64)}}}
const agreement={id,walletAppId:'fixture-app',checkoutPath:'/agreements/xstocks/'+id,terms:{kind:'trade',amount:'1.25',xlayerPayment:{token},trade:reservation.request.trade},observed:{state:2,observedBlock:'100'}}
let calls=[],missing=true,override,failCreate=false
const original=globalThis.fetch
globalThis.fetch=async(url,init)=>{calls.push({url,init});assert.ok(url.startsWith('https://app.hashpaylink.com/api/v2/xstocks-agreements'));assert.equal(init.redirect,'error');assert.equal(init.headers['x-api-key'],key);if(url.includes('purpose=assets'))return Response.json({ok:true,enabled:true,assets:[{address:token}]});if(init.method==='GET'&&missing)return Response.json({ok:false},{status:404});if(init.method==='POST'&&failCreate)return Response.json({ok:false},{status:409});return Response.json({ok:true,agreement:override||agreement})}
try{
 const result=await hostedTradeCheckout(reservation,env);assert.equal(result.checkoutUrl,'https://app.hashpaylink.com/agreements/xstocks/'+id);assert.equal(result.state,2)
 assert.deepEqual(calls.map(c=>c.init.method),['GET','POST']);assert.deepEqual(JSON.parse(calls[1].init.body),reservation.request)
 missing=false;calls=[];await hostedTradeCheckout(reservation,env);assert.equal(calls.length,1,'Recovery reads existing checkout without creating again')
 for(const change of [{walletAppId:'wrong-app'},{checkoutPath:'https://evil.example'},{terms:{...agreement.terms,amount:'2.00'}},{terms:{...agreement.terms,trade:{...agreement.terms.trade,snapshotHash:'wrong'}}}]){override={...agreement,...change};await assert.rejects(()=>hostedTradeCheckout(reservation,env),e=>e.status===502)}
 override=undefined;missing=true;failCreate=true;await assert.rejects(()=>hostedTradeCheckout(reservation,env),e=>e.status===409)
 calls=[];await assert.rejects(()=>hostedTradeCheckout(reservation,{}),e=>e.status===503);assert.equal(calls.length,0)
 assert.equal((await hostedTradeAssets(env)).assets[0].address,token);assert.deepEqual(await hostedTradeAssets({}),{enabled:false,assets:[]})
 console.log('Hosted Trade proxy passed: pinned origin, isolated key, immutable request, read-before-create recovery, response binding and fail-closed rollout.')
}finally{globalThis.fetch=original}
