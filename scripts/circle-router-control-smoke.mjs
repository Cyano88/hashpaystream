import assert from 'node:assert/strict'
import { decodeFunctionData, parseAbi } from 'viem'
import { createCircleWalletHandler } from '../api/circle-wallet.ts'
const wallet={id:'owner-wallet',address:'0x1111111111111111111111111111111111111111',blockchain:'ARC-TESTNET',accountType:'SCA',state:'LIVE'}
const router='0x2222222222222222222222222222222222222222'
let owner=wallet.address,paused=true,challengeCalls=0,lastBody
const original=globalThis.fetch
const handler=createCircleWalletHandler({env:()=>({CIRCLE_TEST_API_KEY:'test'}),identity:async()=> 'owner@example.com',routerControl:async()=>({address:router,owner,paused})})
async function call(extra={}) {const res={code:200,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};await handler({method:'POST',headers:{},body:{action:'set_router_paused',userToken:'session',walletId:wallet.id,walletAddress:wallet.address,paused:false,...extra}},res);return res}
globalThis.fetch=async(url,init)=>{
 if(String(url).includes('/wallets?'))return Response.json({data:{wallets:[wallet]}})
 assert(String(url).endsWith('/contractExecution'));challengeCalls++;lastBody=JSON.parse(init.body);return Response.json({data:{challengeId:'test-challenge'}})
}
try{
 owner=router;assert.equal((await call()).code,403);assert.equal(challengeCalls,0)
 owner=wallet.address;assert.equal((await call({walletId:'other-wallet'})).code,403);assert.equal(challengeCalls,0)
 assert.equal((await call({paused:'false'})).code,400);assert.equal(challengeCalls,0)
 assert.equal((await call({userToken:''})).code,400);assert.equal(challengeCalls,0)
 paused=false;assert.equal((await call()).body.unchanged,true);assert.equal(challengeCalls,0)
 paused=true;const ok=await call({target:wallet.address,callData:'0xdeadbeef',value:'100'});assert.equal(ok.code,200);assert.equal(ok.body.challengeId,'test-challenge');assert.equal(challengeCalls,1)
 assert.equal(lastBody.contractAddress,wallet.address);assert.equal(lastBody.walletId,wallet.id)
 const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:lastBody.callData});assert.equal(batch.args[0].length,1);const tx=batch.args[0][0];assert.equal(tx.target,router);assert.equal(tx.value,0n)
 const decoded=decodeFunctionData({abi:parseAbi(['function setPaused(bool paused)']),data:tx.data});assert.deepEqual(decoded.args,[false])
 const status=await call({action:'router_status'});assert.equal(status.body.owner,wallet.address);assert.equal(challengeCalls,1)
 console.log('PASS: owner-only Circle router control, owned wallet, strict boolean, idempotent state, pinned target, zero value, fixed calldata, challenge-only execution')
}finally{globalThis.fetch=original}
