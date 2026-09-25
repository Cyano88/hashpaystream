import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseUnits,getAddress} from 'viem';
import {createServiceRequestsHandler} from '../api/service-requests.ts';
import {parseWorkPayment,prepareWorkBinding,prepareWorkAction} from '../api/work-xlayer.ts';
import {WORK_USDC} from '../src/lib/workXLayer.ts';
const stock=JSON.parse(readFileSync('src/lib/xStocksCatalog.json','utf8')).assets[0];
let enabled=true;
const env=()=>({HASHPAYSTREAM_APP_OWNERSHIP_SECRET:'t'.repeat(48),HASHPAYSTREAM_WORK_XLAYER_ENABLED:enabled?'true':'false',HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON:JSON.stringify([{address:stock.address,decimals:18}])});
const body={paymentRail:'xlayer',paymentToken:stock.address,reviewHours:48};
const amount='0.000001234567890123';
const payment=parseWorkPayment(body,amount,86400,env());assert.equal(payment.amountUnits,parseUnits(amount,18).toString());
assert.throws(()=>parseWorkPayment(body,'0.0000000000000000001',86400,env()),/precision/);
assert.throws(()=>parseWorkPayment(body,'1',3600,env()),/1 and 30/);
assert.throws(()=>parseWorkPayment({...body,reviewHours:96},'1',86400,env()),/review period/);
assert.throws(()=>parseWorkPayment({...body,paymentToken:'0x'+'44'.repeat(20)},'1',86400,env()),/not approved/);
assert.throws(()=>parseWorkPayment({...body,template:'milestone'},'1',86400,env()),/one release/);
assert.throws(()=>parseWorkPayment({...body,paymentRail:'arc'},'1',86400,env(),payment),/new request/);
const buyer=getAddress('0x'+'11'.repeat(20)),seller=getAddress('0x'+'22'.repeat(20));
const terms={version:1,title:'Design work',description:'Deliver a finished design with source files.',amount,durationSeconds:86400,xlayerPayment:payment};
const binding=prepareWorkBinding('req_work',terms,buyer,seller,1000);
assert.equal(binding.contractTerms.amount,payment.amountUnits);assert.equal(binding.contractTerms.deliveryWindow,7*86400);
assert.notEqual(binding.termsHash,prepareWorkBinding('req_work',{...terms,description:'Different accepted work'},buyer,seller,1000).termsHash);
assert.notEqual(binding.contractTerms.offerId,prepareWorkBinding('req_work',{...terms,version:2},buyer,seller,1000).contractTerms.offerId);
assert.throws(()=>prepareWorkBinding('req_work',terms,buyer,buyer,1000),/distinct/);
const planner=async()=>({enabled:true,actions:['fund','refund','dispute']});
assert.deepEqual((await prepareWorkAction({env:{},binding,account:buyer},planner)).actions,['refund','dispute']);
await assert.rejects(()=>prepareWorkAction({env:{},binding,account:buyer,action:'fund'},planner),/paused/);
await assert.rejects(()=>prepareWorkAction({env:{HASHPAYSTREAM_WORK_XLAYER_ENABLED:'true'},binding,account:buyer,action:'fund'},planner),/no longer approved/);
assert.deepEqual((await prepareWorkAction({env:{HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON:'broken'},binding,account:buyer,action:'refund'},planner)).actions,['refund','dispute']);
let store,who='customer',walletOverride,upstreamCalls=0,block=10,state=1,failWrite=false,lastPlan;
const handler=createServiceRequestsHandler({
 hasStore:()=>true,env,identity:async()=>({userId:who,email:who+'@example.com'}),now:()=>new Date('2026-09-23T12:00:00Z'),id:()=> 'req_worktest',
 readRequests:async()=>structuredClone(store),mutateRequests:async(_key,update)=>{if(failWrite)throw Error('storage offline');store=await update(structuredClone(store));return store;},
 readAccounts:async()=>{throw Error('Circle accounts must not be read');},readEvents:async()=>undefined,readAssessments:async()=>undefined,readPartners:async()=>undefined,
 upstream:async()=>{upstreamCalls++;throw Error('Arc must not be called');},
 workWallet:async(user,address)=>{const expected=walletOverride||(user==='customer'?buyer:seller);if(address.toLowerCase()!==expected.toLowerCase())throw Error('ownership mismatch');return {address:expected,chainId:196,id:'privy:'+expected};},
 workPlan:async(input)=>{lastPlan=input;return {enabled:true,state,observedBlock:String(block),escrow:'0x'+'55'.repeat(20),token:stock.address,decimals:18,amount:payment.amountUnits,actions:['dispatch'],...(input.action?{transaction:{account:input.account,to:'0x'+'55'.repeat(20),data:'0x1234',chainId:196,value:'0'}}:{})};},
});
async function call(action,extra={},method='POST'){const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};await handler({method,headers:{'idempotency-key':'work-create-1'},body:{action,requestId:'req_worktest',version:1,...extra},query:{}},res);return res;}
let result=await call('create',{...body,providerEmail:'provider@example.com',title:terms.title,description:terms.description,amount,durationSeconds:86400,cancellationWindowSeconds:900});assert.equal(result.statusCode,201);assert.equal(result.body.request.terms[0].amountUsdcUnits,'0','stock quantity never enters Arc USDC totals');assert.equal(result.body.request.terms[0].xlayerPayment.amountUnits,payment.amountUnits);
assert.equal((await call('work_xlayer_status')).statusCode,409);
who='attacker';assert.equal((await call('provider_accept')).statusCode,404);
who='provider';assert.equal((await call('provider_accept',{version:2})).statusCode,409);assert.equal((await call('provider_accept')).statusCode,200);
who='customer';result=await call('customer_accept');assert.equal(result.body.request.status,'awaiting_funding');assert.match(result.body.request.agreementId,/^work_/);assert.equal(upstreamCalls,0);
assert.equal((await call('customer_cancel')).statusCode,409);
who='provider';assert.equal((await call('work_xlayer_wallet',{address:seller})).statusCode,200);
who='customer';result=await call('work_xlayer_wallet',{address:buyer});assert.equal(result.statusCode,200);const fixed=store.requests.req_worktest.xlayerWork.binding;assert.equal(fixed.contractTerms.amount,payment.amountUnits);assert.equal(fixed.contractTerms.buyer,buyer);assert.equal(fixed.contractTerms.seller,seller);
await call('work_xlayer_wallet',{address:buyer});assert.deepEqual(store.requests.req_worktest.xlayerWork.binding,fixed,'retry preserves deadline and terms');
walletOverride=getAddress('0x'+'33'.repeat(20));assert.equal((await call('work_xlayer_wallet',{address:walletOverride})).statusCode,409);walletOverride=undefined;
assert.equal((await call('payer_prepare')).statusCode,409,'work cannot enter Arc payer route');
state=2;block=20;await call('work_xlayer_status');assert.equal(store.requests.req_worktest.status,'funded');state=1;block=10;await call('work_xlayer_status');assert.equal(store.requests.req_worktest.status,'funded','old response must not rewind observed lifecycle');
who='provider';state=3;block=21;result=await call('work_xlayer_status',{operation:'dispatch',evidence:'https://example.com/delivered-work'});assert.equal(result.statusCode,200);assert.equal(lastPlan.account,seller);assert.equal(store.requests.req_worktest.xlayerWork.evidence.length,1);
await call('work_xlayer_status',{operation:'dispatch',evidence:'https://example.com/delivered-work'});assert.equal(store.requests.req_worktest.xlayerWork.evidence.length,1,'evidence retries are idempotent');
failWrite=true;assert.equal((await call('work_xlayer_status',{operation:'dispatch',evidence:'Different work evidence'})).statusCode,500,'no prepared transaction returned when evidence persistence fails');failWrite=false;
who='attacker';assert.equal((await call('work_xlayer_status')).statusCode,404);assert.equal((await call('',{},'GET')).body.requests.length,0);
who='customer';state=6;block=22;await call('work_xlayer_status');assert.equal((await call('',{},'GET')).body.requests[0].status,'completed');
enabled=false;assert.equal((await call('work_xlayer_wallet',{address:buyer})).statusCode,409);
assert.equal((await call('work_xlayer_status')).statusCode,200,'existing work remains readable while new payments are paused');
console.log('Work X Layer API passed: exact fractional units, policy limits, versioned terms, participant isolation, no Arc calls, immutable wallets, retry binding, confirmed-state ordering, durable evidence and paused recovery access.');
