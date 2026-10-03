import assert from 'node:assert/strict'
import {hostedTradeCheckout,hostedArcTradeAvailable,hostedTradePaymentRails} from '../api/trade-hosted-checkout.ts'
import {chooseTradePayment,tradePaymentChoice} from '../src/lib/tradePaymentChoice.ts'
import {isTradeCheckoutUrl,tradeCheckoutLink} from '../src/lib/tradeCheckoutLink.ts'
const token='0x3600000000000000000000000000000000000000',id='tag_'+'a'.repeat(64)
const env={HASHPAYSTREAM_TRADE_HOSTED_ENABLED:'true',HASHPAYSTREAM_TRADE_ARC_ENABLED:'true',HASHPAYSTREAM_ARC_TRADE_API_KEY:'hpl_app_'+'a'.repeat(64),HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY:'hpl_app_'+'b'.repeat(64)}
const reservation={kind:'hosted-trade-arc-v1',walletAppId:'fixture',idempotencyKey:'hashpaystream-arc-trade-fixture',request:{kind:'trade',paymentRail:'arc',chainId:5042,paymentToken:token,amount:'1.000001',title:'Synthetic item',description:'Local fixture',customerUserId:'buyer',providerUserId:'seller',trade:{offerId:'11111111-1111-4111-8111-111111111111',snapshotHash:'b'.repeat(64),listingRevision:1,price:'1.000001',deliveryFee:'0',handover:'Pickup',location:'Fixture',carrier:'',returns:'As agreed',dispatchDays:1,deliveryDays:2,inspectionHours:24}}}
const agreement={id,walletAppId:'fixture',checkoutPath:'/agreements/trade/'+id,terms:{kind:'trade',title:reservation.request.title,description:reservation.request.description,amount:'1.000001',trade:reservation.request.trade,payment:{policy:'trade-arc-usdc-v1',rail:'arc',chainId:5042,token,decimals:6,amountUnits:'1000001'}}}
const original=globalThis.fetch;let calls=[],queue=[]
const response=(body,status=200)=>new Response(JSON.stringify(body),{status})
const good=()=>({ok:true,agreement:structuredClone(agreement),observation:{pending:false,checkedAt:new Date().toISOString()}})
globalThis.fetch=async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.headers['x-api-key'],env.HASHPAYSTREAM_ARC_TRADE_API_KEY);assert.ok(url.startsWith('https://app.hashpaylink.com/api/v2/trade-agreements?')||url==='https://app.hashpaylink.com/api/v2/trade-agreements');assert.ok(queue.length,'unexpected remote request');return queue.shift()}
try{
 queue=[response({},404),response(good())];const created=await hostedTradeCheckout(reservation,env);assert.equal(created.checkoutUrl,'https://app.hashpaylink.com'+agreement.checkoutPath);assert.deepEqual(calls.map(c=>c.options.method),['GET','POST']);assert.deepEqual(JSON.parse(calls[1].options.body),reservation.request)
 calls=[];queue=[response(good())];await hostedTradeCheckout(reservation,{...env,HASHPAYSTREAM_TRADE_HOSTED_ENABLED:'false',HASHPAYSTREAM_TRADE_ARC_ENABLED:'false'});assert.equal(calls.length,1)
 calls=[];queue=[response({},404)];await assert.rejects(()=>hostedTradeCheckout(reservation,{...env,HASHPAYSTREAM_TRADE_ARC_ENABLED:'false'}),e=>e.status===409);assert.equal(calls.length,1)
 calls=[];await assert.rejects(()=>hostedTradeCheckout(reservation,{...env,HASHPAYSTREAM_ARC_TRADE_API_KEY:undefined}),e=>e.status===503);assert.equal(calls.length,0,'stock key must never substitute for Arc key')
 for(const mutate of [a=>a.terms.payment.chainId=5042002,a=>a.terms.payment.token='0x'+'11'.repeat(20),a=>a.terms.payment.amountUnits='1000002',a=>a.terms.trade.inspectionHours=72,a=>a.terms.title='Changed',a=>a.checkoutPath='/agreements/xstocks/'+id,a=>a.id='xag_'+'a'.repeat(64),a=>a.terms.stockCustody={policy:'xstocks-shares-v2'}]){const data=good();mutate(data.agreement);queue=[response(data)];await assert.rejects(()=>hostedTradeCheckout(reservation,env),e=>e.status===502)}
 const data=good();delete data.observation;queue=[response(data)];await assert.rejects(()=>hostedTradeCheckout(reservation,env),e=>e.status===502)
 assert.equal(await hostedArcTradeAvailable({}),false)
 queue=[response({ok:true,paymentRail:'arc',chainId:5042,enabled:true})];assert.equal(await hostedArcTradeAvailable(env),true)
 queue=[response({ok:true,paymentRail:'arc',chainId:5042002,enabled:true})];await assert.rejects(()=>hostedArcTradeAvailable(env),e=>e.status===502)
 assert.deepEqual(await hostedTradePaymentRails({}),{arc:{enabled:false,chainId:5042},xlayer:{enabled:false,chainId:196}})
 const old={currency:'USDC',price:'125',deliveryFee:'2'};assert.equal(tradePaymentChoice(old),'legacy');const arc=chooseTradePayment(old,'arc',{arc:true,xlayer:true});assert.equal(arc.price,'');assert.equal(arc.deliveryFee,'0');assert.equal(old.price,'125');assert.equal(arc.settlementToken,token)
 assert.throws(()=>chooseTradePayment(old,'arc',{arc:false,xlayer:true}));const stock=chooseTradePayment(arc,'xlayer',{arc:true,xlayer:true});assert.equal(stock.settlementToken,undefined);assert.equal(stock.currency,'XLAYER_ASSET')
 for(const path of ['trade/tag_','xstocks/xag_'])assert.ok(isTradeCheckoutUrl('https://app.hashpaylink.com/agreements/'+path+'a'.repeat(64)))
 for(const path of ['trade/xag_','xstocks/tag_'])assert.equal(isTradeCheckoutUrl('https://app.hashpaylink.com/agreements/'+path+'a'.repeat(64)),false)
 assert.equal(isTradeCheckoutUrl(created.checkoutUrl+'?returnTo=https://evil.invalid'),false);assert.ok(tradeCheckoutLink(created.checkoutUrl,reservation.request.trade.offerId).includes('returnTo='))
 console.log('Arc hosted Trade passed: isolated key and endpoint, exact terms and units, paused recovery, fail-closed availability, explicit selection and safe links.')
}finally{globalThis.fetch=original}
