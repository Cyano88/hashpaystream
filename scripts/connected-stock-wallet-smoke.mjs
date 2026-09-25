import assert from 'node:assert/strict'
import {createStockBalancesHandler} from '../api/stock-balances.ts'
const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),user='did:privy:builder',linkedUser='did:privy:hosted',app='test_app'
let linked=true,legacyReads=0,upstreamCalls=0,last,wrong=false,fail=false
const handler=createStockBalancesHandler({env:()=>({HASHPAYSTREAM_STOCK_BALANCE_API_KEY:'hpl_app_'+'a'.repeat(64)}),identity:async()=>user,account:async id=>{assert.equal(id,user);return linked?{subject:'subject',hashPayLinkUserId:linkedUser,walletAppId:app}:undefined},legacyWallet:async(id,address)=>{legacyReads++;assert.equal(id,user);assert.equal(address,other);return {address:other}},fetcher:async(url,options)=>{upstreamCalls++;last=JSON.parse(options.body);return {ok:!fail,status:fail?503:200,json:async()=>url.endsWith('/open')?{ok:true,session:{id:'wst_'+'b'.repeat(64),checkoutPath:'/wallet/stocks/wst_'+'b'.repeat(64),chainId:196,userId:linkedUser,walletAppId:app,wallet}}:{ok:true,chainId:196,userId:wrong?'wrong':linkedUser,walletAppId:app,wallet:last.wallet||wallet,receive:{chainId:196,address:last.wallet||wallet,qrValue:last.wallet||wallet},holdings:[]}}}})
async function call(body={},operation='balances'){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{},body,originalUrl:'/api/hashpaystream/v1/stocks/'+operation},res);return res}
let r=await call();assert.equal(r.body.wallet,wallet);assert.equal(r.body.walletSource,'connected');assert.deepEqual(last,{userId:linkedUser,walletAppId:app});assert.equal(legacyReads,0);assert.equal(r.body.userId,undefined)
r=await call({},'receive');assert.equal(r.body.receive.address,wallet)
r=await call({},'open');assert.match(r.body.checkoutUrl,/wallet\/stocks\/wst_/)
const before=upstreamCalls;assert.equal((await call({userId:'attacker'})).statusCode,400);assert.equal((await call({wallet:other})).statusCode,409);assert.equal(upstreamCalls,before)
wrong=true;assert.equal((await call()).statusCode,502);wrong=false
linked=false;r=await call();assert.equal(r.statusCode,409);assert.equal(r.body.needsConnection,true);assert.equal(legacyReads,0)
r=await call({source:'legacy',wallet:other});assert.equal(r.body.wallet,other);assert.equal(r.body.walletSource,'legacy');assert.equal(legacyReads,1)
assert.equal((await call({source:'legacy',wallet:other},'open')).statusCode,400)
linked=true;fail=true;assert.equal((await call()).statusCode,503);assert.equal(legacyReads,1)
console.log('Connected stock proxy: server-owned identity, matching receive/balance/open, rejected client IDs, response binding, no fallback, explicit legacy ownership and upstream failure passed.')
