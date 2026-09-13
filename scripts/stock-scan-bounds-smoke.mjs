import assert from 'node:assert/strict'
import {scanStockReceipts} from '../api/stock-early-pay-reconciliation.ts'
for(const [chainId,expectedEnd] of [[196,199n],[31337,599n]]){
 let queried
 const client={
  getCode:async({blockNumber})=>blockNumber>=100n?'0x01':'0x',
  getBlock:async({blockNumber})=>({hash:'0x'+blockNumber.toString(16).padStart(64,'0')}),
  getLogs:async args=>{queried=args;return []}
 }
 const result=await scanStockReceipts({schema:1,offers:{}},{chainId,deploymentBlock:100,confirmations:1,escrow:'0x'+'11'.repeat(20)},{client,blockNumber:1000n})
 assert.equal(queried.fromBlock,100n)
 assert.equal(queried.toBlock,expectedEnd)
 assert.equal(result.cursor.blockNumber,expectedEnd.toString())
}
console.log('Receipt scan bounds passed: X Layer mainnet uses at most 100 blocks; local rehearsal remains at 500.')
