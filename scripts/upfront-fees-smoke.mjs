import assert from 'node:assert/strict'
import { fundingFeeBpsForDuration, quoteUpfrontFees } from '../api/upfront-fees.ts'

assert.equal(fundingFeeBpsForDuration(14 * 86400), 100)
assert.equal(fundingFeeBpsForDuration(14 * 86400 + 1), 200)
assert.equal(fundingFeeBpsForDuration(30 * 86400), 200)
assert.equal(fundingFeeBpsForDuration(30 * 86400 + 1), 300)
assert.throws(() => fundingFeeBpsForDuration(60 * 86400 + 1), /up to 60 days/)

const quote = quoteUpfrontFees({ protectedAmount: 100_000_000n, advanceAmount: 30_000_000n, durationSeconds: 20 * 86400 })
assert.equal(quote.fundingFeeBps, 200)
assert.equal(quote.totalFundingFeeUsdcUnits, '600000')
assert.equal(quote.funderProfitUsdcUnits, '480000')
assert.equal(quote.funderRepaymentUsdcUnits, '30480000')
assert.equal(quote.standardPlatformFeeUsdcUnits, '1000000')
assert.equal(quote.platformFundingFeeUsdcUnits, '120000')
assert.equal(quote.platformFeeUsdcUnits, '1120000')
assert.equal(quote.providerRemainderUsdcUnits, '68400000')
assert.equal(quote.providerTotalUsdcUnits, '98400000')
assert.equal(BigInt(quote.funderRepaymentUsdcUnits) + BigInt(quote.platformFeeUsdcUnits) + BigInt(quote.providerRemainderUsdcUnits), 100_000_000n)

console.log('HashPayStream fee policy checks passed.')
