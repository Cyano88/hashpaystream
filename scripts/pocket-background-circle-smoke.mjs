import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi,parseAbiParameters} from 'viem'
import {inspectPocketTransfer} from '../api/pocket-transfers.ts'
const original=globalThis.fetch
process.env.CIRCLE_TEST_API_KEY='synthetic-key'
const originalMode=process.env.HASHPAYSTREAM_ARC_ENVIRONMENT, originalMainKey=process.env.CIRCLE_MAINNET_API_KEY
let rpcChain=5042002
const hash='0x'+'a'.repeat(64), blockHash='0x'+'b'.repeat(64)
const row={id:'11111111-1111-4111-8111-111111111111',chainId:5042002,owner:'0x1111111111111111111111111111111111111111',asset:'0x3600000000000000000000000000000000000000',recipient:'0x2222222222222222222222222222222222222222',units:'100000',createdAt:'2026-09-08T00:00:00Z',circlePrepared:true,circleWalletId:'circle-wallet'}
const topics=encodeEventTopics({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),eventName:'Transfer',args:{from:row.owner,to:row.recipient}})
let wrongAmount=false, wrongReference=false, failed=false, reads=0, omitReference=false, detailReads=0, wrongDetailOwner=false
const receipt={transactionHash:hash,blockHash,blockNumber:'0x64',transactionIndex:'0x0',from:row.owner,to:row.owner,cumulativeGasUsed:'0x1',gasUsed:'0x1',effectiveGasPrice:'0x1',status:'0x1',type:'0x2',logsBloom:'0x'+'0'.repeat(512),logs:[]}
const mockProvider=async(url,init)=>{
 if(String(url).includes('/v1/w3s/transactions?')){
  assert.equal(init.headers['x-user-token'],undefined,'Background lookup needs no user token')
  assert.ok(String(url).includes('walletIds=circle-wallet'));reads++
  return Response.json({data:{transactions:[{id:'transaction-id',walletId:row.circleWalletId,sourceAddress:row.owner,...(omitReference?{}:{refId:wrongReference?'another-payment':'hashpaystream-pocket:'+row.id}),state:failed?'FAILED':'COMPLETE',...(failed?{}:{txHash:hash})}]}})
 }
 if(String(url).includes('/v1/w3s/transactions/transaction-id')){
  assert.equal(init.headers['x-user-token'],undefined);detailReads++
  return Response.json({data:{transaction:{id:'transaction-id',walletId:row.circleWalletId,sourceAddress:wrongDetailOwner?row.recipient:row.owner,refId:wrongReference?'another-payment':'hashpaystream-pocket:'+row.id,state:'COMPLETE',txHash:hash}}})
 }
 const body=JSON.parse(init.body)
 const log={address:row.asset,topics,data:encodeAbiParameters(parseAbiParameters('uint256'),[wrongAmount?999n:100000n]),blockHash,blockNumber:'0x64',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x0',removed:false}
 const results={eth_chainId:'0x'+rpcChain.toString(16),eth_getTransactionReceipt:{...receipt,logs:[log]},eth_blockNumber:'0x65',eth_getBlockByNumber:{hash:blockHash,number:'0x64',timestamp:'0x64',transactions:[],gasLimit:'0x1',gasUsed:'0x1',size:'0x1',difficulty:'0x0',totalDifficulty:'0x0',baseFeePerGas:'0x1'}}
 assert.ok(body.method in results,body.method)
 return Response.json({jsonrpc:'2.0',id:body.id,result:results[body.method]})
}
globalThis.fetch=async(url,init)=>{
 if(String(url)==='https://app.hashpaylink.com/api/v2/wallets/arc') {
  const body=JSON.parse(init.body),response=await mockProvider('https://api.circle.com'+body.path,{...init,body:JSON.stringify(body.payload),headers:{...init.headers,'x-user-token':body.userToken}})
  return Response.json({ok:true,...await response.json()})
 }
 return mockProvider(url,init)
}
try{
 const confirmed=await inspectPocketTransfer(row)
 assert.equal(confirmed.status,'successful');assert.equal(confirmed.hash,hash)
 wrongAmount=true
 assert.equal((await inspectPocketTransfer(row)).status,'needs_review','Provider COMPLETE alone cannot establish success')
 wrongReference=true
 assert.equal((await inspectPocketTransfer(row)).hash,undefined,'Never match a different payment by amount or timing')
 wrongReference=false;failed=true
 assert.equal((await inspectPocketTransfer(row)).status,'failed','Only the server-bound provider reference can release a failed payment')
 assert.equal(reads,4)
 failed=false;wrongAmount=false;omitReference=true
 assert.equal((await inspectPocketTransfer(row)).status,'successful','List omission must resolve through exact transaction details')
 wrongReference=true
 assert.equal((await inspectPocketTransfer(row)).hash,undefined,'Detail must bind the exact intent')
 wrongReference=false;wrongDetailOwner=true
 assert.equal((await inspectPocketTransfer(row)).hash,undefined,'Detail source must still match the owned wallet')
 assert.equal(detailReads,3)
 process.env.HASHPAYSTREAM_ARC_ENVIRONMENT='live';process.env.CIRCLE_MAINNET_API_KEY='synthetic-mainnet';process.env.HASHPAYSTREAM_ARC_WALLET_API_KEY='hpl_app_'+'a'.repeat(64)
 wrongDetailOwner=false;rpcChain=5042
 assert.deepEqual(await inspectPocketTransfer(row),{},'Live worker never queries sandbox rows')
 assert.equal((await inspectPocketTransfer({...row,chainId:5042})).status,'successful','Mainnet exact receipt recovery')
 rpcChain=5042002
 assert.notEqual((await inspectPocketTransfer({...row,chainId:5042})).status,'successful','Wrong RPC chain cannot confirm mainnet payment')
 console.log('Background Circle lookup without a user session, unique intent matching, exact chain receipt and provider failure checks passed.')
}finally{globalThis.fetch=original;delete process.env.HASHPAYSTREAM_ARC_WALLET_API_KEY;delete process.env.CIRCLE_TEST_API_KEY;if(originalMode===undefined)delete process.env.HASHPAYSTREAM_ARC_ENVIRONMENT;else process.env.HASHPAYSTREAM_ARC_ENVIRONMENT=originalMode;if(originalMainKey===undefined)delete process.env.CIRCLE_MAINNET_API_KEY;else process.env.CIRCLE_MAINNET_API_KEY=originalMainKey}
