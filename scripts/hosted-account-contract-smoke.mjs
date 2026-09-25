import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHostedAccountHandler} from '../api/hosted-account.ts';
const source=process.env.HASHPAYLINK_CONTRACT_TEST_ROOT;
if(!source)throw Error('Set HASHPAYLINK_CONTRACT_TEST_ROOT to the reviewed Hash PayLink checkout.');
const {createWalletConnectionHandlers}=await import(pathToFileURL(resolve(source,'api/wallet-connections.ts')).href);
const store=()=>{const values=new Map();return {read:async key=>structuredClone(values.get(key)),mutate:async(key,update)=>{const next=await update(structuredClone(values.get(key)));values.set(key,structuredClone(next));return next;}}};
async function call(handler,body,method='POST'){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};await handler({method,body,headers:{},query:{}},res);return res;}
const now=Date.now(),hplStore=store(),hpsStore=store();let email='person@example.com';
const hpl=createWalletConnectionHandlers({...hplStore,hasStore:()=>true,now:()=>now,appId:()=> 'hpl-app',
 policy:async()=>({partnerId:'dev-fixture',merchantName:'Hash PayStream',environment:'live',checkoutMode:'human',capabilities:['arc_agreements']}),
 identity:async()=>({userId:'did:privy:hpl-identity',email,emailVerifiedAt:now})});
const env={HASHPAYSTREAM_HOSTED_ACCOUNT_ENABLED:'true',HASHPAYSTREAM_WALLET_CONNECTION_API_KEY:'hpl_app_'+'a'.repeat(64),HASHPAYSTREAM_APP_OWNERSHIP_SECRET:'fixture-only-secret-'+'s'.repeat(32),HASHPAYSTREAM_HASH_PAYLINK_PRIVY_APP_ID:'hpl-app',PRIVY_APP_ID:'hps-app'};
const hps=createHostedAccountHandler({...hpsStore,env:()=>env,hasStore:()=>true,now:()=>now,
 identity:async()=>({userId:'did:privy:hps-identity',email:'person@example.com'}),
 upstream:async body=>{const res=await call(hpl.developer,body);return {status:res.statusCode,body:res.body};}});
let result=await call(hps,{action:'start'});assert.equal(result.statusCode,200);assert.equal(result.body.projectName,'Hash PayStream');
const url=new URL(result.body.connectUrl),id=url.pathname.split('/').pop(),access=new URLSearchParams(url.hash.slice(1)).get('access');
assert.equal((await call(hps,{action:'complete'})).statusCode,409);
email='wrong@example.com';assert.equal((await call(hpl.participant,{action:'approve',id,access})).statusCode,403);email='person@example.com';
assert.equal((await call(hpl.participant,{action:'approve',id,access})).body.approved,true);
assert.equal((await call(hps,{action:'complete'})).body.connected,true);
assert.equal((await call(hps,{},'GET')).body.connected,true);
assert.equal((await call(hps,{action:'start'})).body.connectUrl,undefined);
console.log('Cross-repository handoff passed: real HPS and HPL handlers, different Privy identities, pending approval, wrong-email rejection, approved redemption and persistent connection. No real authentication or wallet transaction performed.');
