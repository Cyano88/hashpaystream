import assert from 'node:assert/strict'
import { keccak256 } from 'viem'
import { StockSettlementTargetError, verifyStockSettlementTargets } from '../api/stock-delivery-settlement-targets.ts'
const address = value => '0x' + String(value).padStart(40, '0'), code = '0x60006000'
const input = { contract: address(1), runtimeHash: keccak256(code), router: address(2), asset: address(3), underwritingSigner: address(4), riskSigner: address(5), protectionSigner: address(6), repaymentSigner: address(7), treasury: address(8), code, gasBalance: async () => 1n }
const values = { delivery: { eip712Domain: ['0x0f','HashPayStream Stock Delivery','1',196n,input.contract], paused: false, arcRepaymentRouter: input.router, underwritingSigner: input.underwritingSigner, riskSigner: input.riskSigner, protectionSigner: input.protectionSigner, allowedStockAssets: true }, router: { eip712Domain: ['0x0f','HashPayStream Upfront Repayment','4',5042002n,input.router], paused: false, creditSigner: input.repaymentSigner, platformTreasury: input.treasury, asset: '0x3600000000000000000000000000000000000000' } }
const read = async (target, name) => values[target][name]
await verifyStockSettlementTargets({ ...input, read })
for (const [target, field, bad, expected] of [['delivery','paused',true,'STOCK_DELIVERY_PAUSED'],['delivery','arcRepaymentRouter',address(9),'STOCK_DELIVERY_ROUTER_MISMATCH'],['delivery','allowedStockAssets',false,'STOCK_ASSET_NOT_ALLOWED'],['router','paused',true,'ARC_ROUTER_PAUSED'],['router','creditSigner',address(9),'ARC_ROUTER_SIGNER_MISMATCH']]) await assert.rejects(verifyStockSettlementTargets({ ...input, read: async (t,n) => t === target && n === field ? bad : read(t,n) }), error => error instanceof StockSettlementTargetError && error.code === expected)
await assert.rejects(verifyStockSettlementTargets({ ...input, runtimeHash: '0x' + '00'.repeat(32), read }), error => error.code === 'STOCK_DELIVERY_RUNTIME_MISMATCH')
await assert.rejects(verifyStockSettlementTargets({ ...input, riskSigner: input.underwritingSigner, read }), error => error.code === 'STOCK_DELIVERY_SIGNERS_NOT_SEPARATE')
await assert.rejects(verifyStockSettlementTargets({ ...input, read, gasBalance: async () => 0n }), error => error.code === 'RELAYER_GAS_UNAVAILABLE')
console.log('Stock delivery activation target checks passed.')