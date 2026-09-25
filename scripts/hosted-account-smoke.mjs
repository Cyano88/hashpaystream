import assert from 'node:assert/strict';
import {createHostedAccountHandler} from '../api/hosted-account.ts';
const store=new Map(), calls=[];
let now=10000, who={userId:'did:privy:hps-user',email:'user@example.com'}, approved=false, responseOverride, failWrite=false;
const env={HASHPAYSTREAM_HOSTED_ACCOUNT_ENABLED:'true',HASHPAYSTREAM_WALLET_CONNECTION_API_KEY:'hpl_app_'+'a'.repeat(64),HASHPAYSTREAM_APP_OWNERSHIP_SECRET:'fixture-secret-'+'b'.repeat(40),HASHPAYSTREAM_HASH_PAYLINK_PRIVY_APP_ID:'hpl-app',PRIVY_APP_ID:'hps-app'};
const id='wcs_'+'1'.repeat(48),access='c'.repeat(43);let subject;
const handler=createHostedAccountHandler({env:()=>env,now:()=>now,identity:async()=>who,hasStore:()=>true,
 read:async key=>structuredClone(store.get(key)),
 mutate:async(key,update)=>{const next=await update(structuredClone(store.get(key)));if(failWrite)throw Error('Secret storage detail');store.set(key,structuredClone(next));return next;},
 upstream:async(body,config)=>{calls.push(body);assert.equal(config.apiKey,env.HASHPAYSTREAM_WALLET_CONNECTION_API_KEY);if(responseOverride)return responseOverride;
 if(body.action==='create'){subject=body.subject;assert.equal(body.email,who.email);assert.match(body.challenge,/^[a-f0-9]{64}$/);return {status:201,body:{ok:true,id,expiresAt:now+600000,connectPath:'/wallet/connect/'+id+'#access='+access}};}
 return approved?{status:200,body:{ok:true,subject,hashPayLinkUserId:'did:privy:hpl-user',walletAppId:'hpl-app'}}:{status:409,body:{ok:false}};
 }});
async function call(action,extra={}){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};await handler({method:action?'POST':'GET',headers:{},body:{action,...extra}},res);return res;}
assert.equal((await call()).body.connected,false);
let r=await call('start',{email:'attacker@example.com',subject:'someone-else',id:'fake',verifier:'fake'});assert.equal(r.statusCode,200);assert.ok(r.body.connectUrl.startsWith('https://app.hashpaylink.com/wallet/connect/'));
assert.ok(!JSON.stringify([...store.values()]).includes(access),'Capability encrypted at rest');assert.ok(!JSON.stringify(r.body).includes('verifier'));
assert.equal((await call('start')).body.connectUrl,r.body.connectUrl);assert.equal(calls.length,1,'Retry reuses pending session');
assert.equal((await call('complete')).statusCode,409);
who={...who,userId:'did:privy:other'};assert.equal((await call('complete')).statusCode,409);assert.equal((await call()).body.pending,false);who={userId:'did:privy:hps-user',email:'changed@example.com'};assert.equal((await call('complete')).statusCode,409);who.email='user@example.com';
approved=true;
responseOverride={status:200,body:{ok:true,subject:'wrong',hashPayLinkUserId:'did:privy:attacker',walletAppId:'hpl-app'}};assert.equal((await call('complete')).statusCode,502);assert.equal((await call()).body.connected,false);
responseOverride={status:200,body:{ok:true,subject,hashPayLinkUserId:'did:privy:hpl-user',walletAppId:'wrong'}};assert.equal((await call('complete')).statusCode,502);responseOverride=undefined;
failWrite=true;assert.equal((await call('complete')).statusCode,500);assert.equal((await call()).body.connected,false);failWrite=false;
assert.equal((await call('complete')).body.connected,true);const linked=[...store.values()][0];assert.equal(linked.linked.hashPayLinkUserId,'did:privy:hpl-user');assert.equal(linked.pending,undefined);
const callCount=calls.length;assert.equal((await call('start')).body.connected,true);assert.equal((await call('complete')).body.connected,true);assert.equal(calls.length,callCount,'Immutable link cannot be silently overwritten');
assert.ok(!JSON.stringify((await call()).body).includes('did:privy:'));
env.HASHPAYSTREAM_HASH_PAYLINK_PRIVY_APP_ID='changed';assert.equal((await call()).statusCode,409);env.HASHPAYSTREAM_HASH_PAYLINK_PRIVY_APP_ID='hpl-app';
who.userId='did:privy:fresh';await call('start');now+=600001;assert.equal((await call('complete')).statusCode,409);
responseOverride={status:201,body:{ok:true,id,expiresAt:now+600000,connectPath:'https://evil.example/#access='+access}};assert.equal((await call('start')).statusCode,502);responseOverride=undefined;
env.HASHPAYSTREAM_WALLET_CONNECTION_API_KEY='hpl_test_'+'a'.repeat(64);assert.equal((await call('start')).statusCode,503);
env.HASHPAYSTREAM_HOSTED_ACCOUNT_ENABLED='false';assert.equal((await call()).body.enabled,false);assert.equal((await call('start')).statusCode,503);
console.log('Hosted account bridge passed: server-owned identity, encrypted proof, session isolation, response binding, expiry, immutable linkage, retries, storage failure, sandbox rejection and URL pinning.');
