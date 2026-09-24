import assert from 'node:assert/strict'
import { verifyArcMainnetWallet } from '../api/arc-mainnet-wallet-binding.ts'
import { createStreamAccountsHandler } from '../api/stream-accounts.ts'
const address='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222'
const input={userToken:'synthetic-user-token',walletId:'wallet-mainnet',address}
const env={HASHPAYSTREAM_CIRCLE_MAINNET_API_KEY:'LIVE_API_KEY:fixture:synthetic',HASHPAYSTREAM_APP_OWNERSHIP_SECRET:'s'.repeat(48)}
const original=globalThis.fetch;let calls=0;let wallet={id:input.walletId,address,blockchain:'ARC',accountType:'SCA',state:'LIVE'}
globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://api.circle.com/v1/w3s/wallets?blockchain=ARC&pageSize=50');assert.equal(init.method,undefined);assert.equal(init.redirect,'error');assert.equal(init.headers['x-user-token'],input.userToken);return Response.json({data:{wallets:[wallet]}})}
try {
 for(const key of ['', 'TEST_API_KEY:fixture:synthetic'])await assert.rejects(verifyArcMainnetWallet(input,{HASHPAYSTREAM_CIRCLE_MAINNET_API_KEY:key}),/not configured/)
 assert.equal(calls,0)
 const verified=await verifyArcMainnetWallet(input,env);assert.equal(verified.chainId,5042)
 for(const invalid of [{blockchain:'ARC-TESTNET'},{blockchain:'ARC_TESTNET'},{accountType:'EOA'},{state:'FROZEN'},{state:undefined},{id:'other-wallet'},{address:other}]){
 const previous=wallet;wallet={...wallet,...invalid};await assert.rejects(verifyArcMainnetWallet(input,env),/required/);wallet=previous
 }
 let store;let deny=false;let identity='owner';let replacement=false
 const handler=createStreamAccountsHandler({hasStore:()=>true,read:async()=>store,mutate:async(_key,update)=>(store=await update(store)),identity:async()=>({email:identity+'@example.test',emails:[identity+'@example.test'],wallets:[other]}),env:()=>env,now:()=>new Date('2026-09-24T10:00:00Z'),mainnetWallet:async()=>{if(deny)throw Object.assign(Error('Verification rejected'),{status:403});return {...verified,address:replacement?other:address}}})
 async function call(body){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await handler({method:'POST',headers:{},body},res);return res}
 const action={action:'register_mainnet_wallet',circleUserToken:input.userToken,walletId:input.walletId,walletAddress:address}
 deny=true;assert.equal((await call(action)).statusCode,403);assert.ok(Object.values(store.accounts).every(a=>!a.arcMainnetWallet))
 deny=false;const bound=await call(action);assert.equal(bound.statusCode,200);assert.equal(bound.body.profile.walletAddress,'');assert.equal(bound.body.profile.arcMainnetWallet.chainId,5042)
 assert.ok(!JSON.stringify(store).includes(input.userToken));assert.ok(!JSON.stringify(store).includes(env.HASHPAYSTREAM_CIRCLE_MAINNET_API_KEY))
 assert.equal((await call(action)).statusCode,200)
 identity='another';assert.equal((await call(action)).statusCode,409)
 identity='owner';replacement=true;assert.equal((await call(action)).statusCode,409);replacement=false
 const legacy=await call({action:'register_wallet',walletAddress:other});assert.equal(legacy.statusCode,200);assert.equal(legacy.body.profile.walletAddress,other);assert.equal(legacy.body.profile.arcMainnetWallet.address,address)
 console.log('Mainnet binding passed: production key, exact chain/wallet/state, session ownership, unique account, no replacement, legacy isolation and secret exclusion.')
}finally{globalThis.fetch=original}
