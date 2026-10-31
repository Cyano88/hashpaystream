export const BPS_DENOMINATOR = 10_000n
export const STANDARD_COMPLETION_FEE_BPS = 100
export const PLATFORM_FUNDING_FEE_SHARE_BPS = 2_000
export const MAX_EARLY_PAY_DURATION_SECONDS = 60 * 24 * 60 * 60

export type UpfrontFeeQuote = {
  fundingFeeBps: number
  advanceUsdcUnits: string
  totalFundingFeeUsdcUnits: string
  funderProfitUsdcUnits: string
  funderRepaymentUsdcUnits: string
  standardPlatformFeeUsdcUnits: string
  platformFundingFeeUsdcUnits: string
  platformFeeUsdcUnits: string
  providerRemainderUsdcUnits: string
  providerTotalUsdcUnits: string
}

function ceilBps(amount: bigint, bps: number) {
  return (amount * BigInt(bps) + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR
}

export function fundingFeeBpsForDuration(durationSeconds: number) {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_EARLY_PAY_DURATION_SECONDS) {
    throw Object.assign(new Error('Early pay supports agreements lasting up to 60 days.'), { status: 409 })
  }
  if (durationSeconds <= 14 * 24 * 60 * 60) return 100
  if (durationSeconds <= 30 * 24 * 60 * 60) return 200
  return 300
}

export function quoteUpfrontFees(input: { protectedAmount: bigint; advanceAmount: bigint; durationSeconds: number }): UpfrontFeeQuote {
  const { protectedAmount, advanceAmount } = input
  if (protectedAmount <= 0n || advanceAmount <= 0n || advanceAmount >= protectedAmount) {
    throw Object.assign(new Error('The early-pay amount cannot be priced safely.'), { status: 409 })
  }
  const fundingFeeBps = fundingFeeBpsForDuration(input.durationSeconds)
  const totalFundingFee = ceilBps(advanceAmount, fundingFeeBps)
  const platformFundingFee = totalFundingFee * BigInt(PLATFORM_FUNDING_FEE_SHARE_BPS) / BPS_DENOMINATOR
  const funderProfit = totalFundingFee - platformFundingFee
  const standardPlatformFee = ceilBps(protectedAmount, STANDARD_COMPLETION_FEE_BPS)
  const platformFee = standardPlatformFee + platformFundingFee
  const funderRepayment = advanceAmount + funderProfit
  const providerRemainder = protectedAmount - funderRepayment - platformFee
  if (funderProfit <= 0n || platformFee <= 0n || providerRemainder <= 0n) {
    throw Object.assign(new Error('The protected payment is too small for the production fee split.'), { status: 409 })
  }
  return {
    fundingFeeBps,
    advanceUsdcUnits: advanceAmount.toString(),
    totalFundingFeeUsdcUnits: totalFundingFee.toString(),
    funderProfitUsdcUnits: funderProfit.toString(),
    funderRepaymentUsdcUnits: funderRepayment.toString(),
    standardPlatformFeeUsdcUnits: standardPlatformFee.toString(),
    platformFundingFeeUsdcUnits: platformFundingFee.toString(),
    platformFeeUsdcUnits: platformFee.toString(),
    providerRemainderUsdcUnits: providerRemainder.toString(),
    providerTotalUsdcUnits: (advanceAmount + providerRemainder).toString(),
  }
}
