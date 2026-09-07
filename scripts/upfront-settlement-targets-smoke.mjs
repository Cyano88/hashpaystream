import assert from 'node:assert/strict'
import {verifySettlementTargets,SettlementTargetError} from '../api/upfront-settlement-targets.ts'
const address=i=>'0x'+String(i).padStart(40,'0')
const input={escrowVersion:'2',escrow:address(1),router:address(2),signer:address(3),treasury:address(4),gasBalance:async()=>1n}
const values={escrow:{eip712Domain:['0x0f','HashPayStream Upfront','2',196n,input.escrow],paused:false,arcRepaymentRouter:input.router,asset:'0xB6CEceAB302E2E4948951eE7843FC24E92933061'},router:{eip712Domain:['0x0f','HashPayStream Upfront Repayment','4',5042002n,input.router],paused:false,creditSigner:input.signer,platformTreasury:input.treasury,asset:'0x3600000000000000000000000000000000000000'}}
const read=async(target,name)=>values[target][name]
await verifySettlementTargets({...input,read})
await assert.rejects(verifySettlementTargets({...input,escrowVersion:'1',read:async()=>assert.fail('Legacy target must fail before chain reads')}),e=>e instanceof SettlementTargetError&&e.code==='REVIEWED_ESCROW_REQUIRED')
for(const [target,field,bad,code] of [
 ['escrow','paused',true,'ESCROW_PAUSED'],['router','paused',true,'ROUTER_PAUSED'],
 ['escrow','arcRepaymentRouter',address(9),'ESCROW_ROUTER_MISMATCH'],['router','creditSigner',address(9),'ROUTER_SIGNER_MISMATCH'],
 ['router','platformTreasury',address(9),'ROUTER_TREASURY_MISMATCH'],['escrow','asset',address(9),'ESCROW_ASSET_MISMATCH'],['router','asset',address(9),'ROUTER_ASSET_MISMATCH'],
])await assert.rejects(verifySettlementTargets({...input,read:async(t,n)=>t===target&&n===field?bad:read(t,n)}),e=>e.code===code)
for(const target of ['escrow','router'])for(const index of [0,1,2,3,4]){
 const domain=[...values[target].eip712Domain];domain[index]=index===3?1n:'invalid'
 await assert.rejects(verifySettlementTargets({...input,read:async(t,n)=>t===target&&n==='eip712Domain'?domain:read(t,n)}),e=>e.code==='CONTRACT_DOMAIN_MISMATCH')
}
await assert.rejects(verifySettlementTargets({...input,read,gasBalance:async()=>0n}),e=>e.code==='RELAYER_GAS_UNAVAILABLE')
await assert.rejects(verifySettlementTargets({...input,read:async()=>{throw Error('RPC_UNAVAILABLE')}}),/RPC_UNAVAILABLE/)
console.log('Settlement activation rejects legacy domains, wrong signer/router/assets/treasury, paused contracts and zero gas.')
