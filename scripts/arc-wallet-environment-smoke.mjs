import assert from 'node:assert/strict'
import { arcWalletEnvironment } from '../api/arc-wallet-environment.ts'
import { createCircleWalletHandler, listCircleArcWallets, readArcUsdcBalance } from '../api/circle-wallet.ts'
import { createServiceRequestsHandler } from '../api/service-requests.ts'
import { createStreamAccountsHandler } from '../api/stream-accounts.ts'
const address='0x1111111111111111111111111111111111111111'
const live={HASHPAYSTREAM_ARC_ENVIRONMENT:'live',HASHPAYSTREAM_ARC_WALLET_API_KEY:'hpl_app_'+'c'.repeat(64),CIRCLE_TEST_API_KEY:'TEST_SYNTHETIC',VITE_CIRCLE_USER_WALLET_APP_ID_ARC_MAINNET:'mainnet-app',HASHPAYSTREAM_APP_OWNERSHIP_SECRET:'s'.repeat(48),HASHPAYSTREAM_ACCOUNT_STORE_KEY:'legacy-override',HASHPAYSTREAM_ARC_MAINNET_RPC_URL:'https://wrong-chain.example'}
assert.equal(arcWalletEnvironment(live).chainId,5042)
assert.equal(arcWalletEnvironment(live).accountStore,'hashpaystream:arc-mainnet:5042:accounts:v1')
assert.equal(arcWalletEnvironment({...live,HASHPAYSTREAM_ARC_WALLET_API_KEY:undefined}).apiKey,undefined)
assert.throws(()=>arcWalletEnvironment({HASHPAYSTREAM_ARC_ENVIRONMENT:'production'}))
const original=globalThis.fetch,calls=[]
globalThis.fetch=async(url,init={})=>{const u=new URL(url);const b=init.body?JSON.parse(init.body):{};calls.push({url:u.href,body:b,headers:init.headers});if(u.hostname==='app.hashpaylink.com'){assert.equal(u.pathname,'/api/v2/wallets/arc');if(b.path==='/configuration')return Response.json({ok:true,data:{chainId:5042,blockchain:'ARC',appId:'mainnet-app'}});if(b.path.startsWith('/v1/w3s/wallets'))return Response.json({ok:true,data:{wallets:[{id:'test',address,blockchain:'ARC-TESTNET',accountType:'SCA'},{id:'main',address,blockchain:'ARC',accountType:'SCA'}]}});return Response.json({ok:true,data:{challengeId:'synthetic'}})}if(u.hostname==='wrong-chain.example'||u.hostname==='rpc.mainnet.arc.io'){if(b.method==='eth_chainId')return Response.json({jsonrpc:'2.0',id:b.id,result:u.hostname==='wrong-chain.example'?'0x4cef52':'0x13b2'});assert.equal(u.hostname,'rpc.mainnet.arc.io');return Response.json({jsonrpc:'2.0',id:b.id,result:'0x'+'0'.repeat(64)})}if(u.pathname==='/v1/w3s/wallets')return Response.json({data:{wallets:[{id:'test',address,blockchain:'ARC-TESTNET',accountType:'SCA'},{id:'main',address,blockchain:'ARC',accountType:'SCA'}]}});return Response.json({data:{challengeId:'synthetic'}})}
const res=()=>({statusCode:200,setHeader(){},status(s){this.statusCode=s;return this},json(b){this.body=b;return this}})
const call=async(handler,body,method='POST')=>{const r=res();await handler({method,headers:{},body,query:{}},r);return r}
try{
 assert.deepEqual((await listCircleArcWallets('synthetic',live)).map(w=>w.id),['main'])
 assert.deepEqual((await listCircleArcWallets('synthetic',{CIRCLE_TEST_API_KEY:'TEST_SYNTHETIC'})).map(w=>w.id),['test'])
 const h=createCircleWalletHandler({env:()=>live,identity:async()=> 'owner@example.invalid'})
 assert.equal((await call(h,{action:'list_wallets',userToken:'synthetic'})).statusCode,409)
 assert.equal((await call(h,{action:'list_wallets',walletEnvironment:'test',userToken:'synthetic'})).statusCode,409)
 const config=await call(h,{action:'configuration',walletEnvironment:'live'});assert.equal(config.body.chainId,5042);assert.equal(config.body.appId,'mainnet-app')
 await call(h,{action:'create_wallet',walletEnvironment:'live',userToken:'synthetic'});const creation=calls.at(-1);assert.deepEqual(creation.body.payload.blockchains,['ARC']);assert.equal(creation.headers['x-api-key'],live.HASHPAYSTREAM_ARC_WALLET_API_KEY)
 const noKey=createCircleWalletHandler({env:()=>({...live,HASHPAYSTREAM_ARC_WALLET_API_KEY:undefined}),identity:async()=> 'owner@example.invalid'});assert.equal((await call(noKey,{action:'list_wallets',walletEnvironment:'live',userToken:'synthetic'})).statusCode,503)
 assert.equal(await readArcUsdcBalance(address,live),0n)
 assert.ok(calls.every(c=>!c.url.includes('rpc.testnet.arc.network')))
 let store,chain='ARC-TESTNET';const storeKeys=[]
 const accounts=createStreamAccountsHandler({env:()=>live,hasStore:()=>true,identity:async()=>({email:'owner@example.invalid',emails:['owner@example.invalid'],wallets:[address]}),read:async()=>store,mutate:async(k,fn)=>{storeKeys.push(k);store=await fn(store);return store},circleWallets:async()=>[{id:'verified',address,blockchain:chain,accountType:'SCA'}]})
 assert.equal((await call(accounts,{action:'register_wallet',walletAddress:address})).statusCode,403)
 assert.equal((await call(accounts,{action:'register_wallet',walletAddress:address,circleUserToken:'synthetic'})).statusCode,403)
 chain='ARC';const linked=await call(accounts,{action:'register_wallet',walletAddress:address,circleUserToken:'synthetic'});assert.equal(linked.statusCode,200);assert.equal(linked.body.profile.walletChainId,5042)
 assert.ok(storeKeys.every(k=>k==='hashpaystream:arc-mainnet:5042:accounts:v1'))
 const historyKeys=[];const empty=async key=>{historyKeys.push(key);return undefined};const history=createServiceRequestsHandler({env:()=>live,hasStore:()=>true,identity:async()=>({email:'owner@example.invalid',emails:['owner@example.invalid'],wallets:[]}),readRequests:empty,readEvents:empty,readAssessments:empty,readPartners:empty});
 const cleanHistory=await call(history,{},'GET');assert.equal(cleanHistory.statusCode,200);assert.deepEqual(cleanHistory.body.requests,[]);assert.ok(historyKeys.every(k=>k.startsWith('hashpaystream:arc-mainnet:5042:')));assert.equal((await call(history,{action:'create'})).statusCode,503);
 console.log('PASS: exact Circle chain; separate credentials and stores; app/backend mismatch; no testnet RPC fallback; verified mainnet account binding.')
}finally{globalThis.fetch=original}
