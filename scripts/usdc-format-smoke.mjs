import assert from 'node:assert/strict'
import { formatUsdcBalance } from '../src/lib/useAgreements.ts'

assert.equal(formatUsdcBalance('7968886'), '7.97 USDC')
assert.equal(formatUsdcBalance('65992064'), '65.99 USDC')
assert.equal(formatUsdcBalance('3000'), '<0.01 USDC')
assert.equal(formatUsdcBalance('0'), '0.00 USDC')

console.log('HashPayStream overview balance formatting checks passed.')
