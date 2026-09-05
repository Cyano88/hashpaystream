import assert from 'node:assert/strict'
import { planReceiptLedger } from '../api/chain-receipt-ledger.ts'
const address=n=>'0x'+String(n).repeat(40)
const arcToken='0x3600000000000000000000000000000000000000', xToken='0xb6ceceab302e2e4948951ee7843fc24e92933061'
const payer=address(1),escrow=address(2),router=address(3),funder=address(4),provider=address(5),treasury=address(6),advance=address(7)
let sequence=0
function receipt(eventName,contractAddress,transfers,eventAmounts,eventAddresses={},x=false) {
  const transactionHash='0x'+String(++sequence).padStart(64,'0')
  return { observationId:`observation_${sequence}`,occurredAt:'2026-09-05T00:00:00.000Z',receipt:{verified:true,codes:[],transactionHash,logIndex:0,blockNumber:'100',blockHash:'0x'+'a'.repeat(64),payload:{network:x?'xlayer-mainnet':'arc-testnet',chainId:x?196:5042002,tokenAddress:x?xToken:arcToken,eventName,contractAddress,transfers,eventAmounts,eventAddresses}} }
}
const transfer=(from,to,amountUnits)=>({from,to,amountUnits})
const rows=[
  receipt('AgreementActivated',escrow,[transfer(payer,escrow,'500')],{amount:'500'}),
  receipt('StepReleased',escrow,[transfer(escrow,router,'500')],{amount:'500'}),
  receipt('RepaymentSettled',router,[transfer(router,funder,'300'),transfer(router,provider,'190'),transfer(router,treasury,'10')],{funderAmount:'300',providerAmount:'190',treasuryAmount:'10'},{funder,provider,treasury}),
  receipt('AdvanceFunded',advance,[transfer(funder,advance,'250')],{advanceAmount:'250'},{funder},true),
  receipt('AdvanceReleased',advance,[transfer(advance,provider,'250')],{advanceAmount:'250'},{provider},true),
]
const plan=planReceiptLedger(rows)
assert.equal(plan.postings.length,5)
assert.equal(plan.postings.reduce((n,p)=>n+p.entries.length,0),14)
assert.ok(plan.accounts.every(a=>a.identityDomain==='system'&&a.purpose!=='user_available'))
for(const a of plan.accounts.filter(a=>a.controlled)) assert.equal(plan.balances.get(a.accountId),0n)
const providers=plan.accounts.filter(a=>a.address===provider)
assert.equal(providers.length,2)
assert.equal(plan.balances.get(providers.find(a=>a.network==='arc-testnet').accountId),190n)
assert.equal(plan.balances.get(providers.find(a=>a.network==='xlayer-mainnet').accountId),250n)
for(const p of plan.postings) assert.equal(p.entries.reduce((n,e)=>n+(e.side==='credit'?1n:-1n)*BigInt(e.amountUnits),0n),0n)
assert.deepEqual(planReceiptLedger(rows).postings,plan.postings)
assert.throws(()=>planReceiptLedger([...rows,rows[0]]),/DUPLICATE_OR_REORG/)
assert.throws(()=>planReceiptLedger([...rows,{...rows[0],observationId:'another_block',receipt:{...rows[0].receipt,blockHash:'0x'+'b'.repeat(64)}}]),/DUPLICATE_OR_REORG/)
assert.throws(()=>planReceiptLedger([{...rows[0],receipt:{...rows[0].receipt,verified:false}}]),/NOT_VERIFIED/)
const bad=structuredClone(rows);bad[2].receipt.payload.transfers[0].amountUnits='301'
assert.throws(()=>planReceiptLedger(bad),/SPLIT_INVALID/)
const wrong=structuredClone(rows);wrong[4].receipt.payload.transfers[0].to=funder
assert.throws(()=>planReceiptLedger(wrong),/TRANSFER_INVALID/)
assert.throws(()=>planReceiptLedger([]),/RECEIPTS_EMPTY/)
console.log('Receipt ledger balance, split, network isolation, duplicate/reorg and fail-closed checks passed.')