export type SavingsSchedule = {
  deposited: bigint
  remaining: bigint
  withdrawable: bigint
  releaseAmount: bigint
  firstReleaseAt: number
  interval: number
  emergencyExitAt: number
}

export function nextSavingsRelease(plan: SavingsSchedule, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (plan.remaining === 0n || plan.withdrawable >= plan.remaining) return 0
  if (plan.emergencyExitAt > 0 && plan.emergencyExitAt <= nowSeconds) return 0

  let scheduledRelease = plan.firstReleaseAt
  if (nowSeconds >= plan.firstReleaseAt) {
    const releasedPeriods = Math.floor((nowSeconds - plan.firstReleaseAt) / plan.interval) + 1
    if (BigInt(releasedPeriods) * plan.releaseAmount >= plan.deposited) return 0
    scheduledRelease = plan.firstReleaseAt + releasedPeriods * plan.interval
  }

  if (plan.emergencyExitAt > nowSeconds && plan.emergencyExitAt < scheduledRelease) return plan.emergencyExitAt
  return scheduledRelease
}
