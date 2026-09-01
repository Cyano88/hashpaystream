export type SavingsSchedule = {
  deposited: bigint
  remaining: bigint
  withdrawable: bigint
  releaseAmount: bigint
  firstReleaseAt: number
  interval: number
  emergencyExitAt: number
}

export type SavingsPlanPreview = {
  releases: number
  firstReleaseAt: number
  finalReleaseAt: number
  finalReleaseAmount: bigint
}

export function savingsPlanPreview(
  deposited: bigint,
  releaseAmount: bigint,
  interval: number,
  createdAt = Math.floor(Date.now() / 1000),
): SavingsPlanPreview | undefined {
  if (deposited <= 0n || releaseAmount <= 0n || releaseAmount > deposited || !Number.isSafeInteger(interval) || interval <= 0) return undefined
  const releaseCount = (deposited + releaseAmount - 1n) / releaseAmount
  if (releaseCount > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
  const releases = Number(releaseCount)
  const firstReleaseAt = createdAt + interval
  return {
    releases,
    firstReleaseAt,
    finalReleaseAt: firstReleaseAt + (releases - 1) * interval,
    finalReleaseAmount: deposited - (releaseCount - 1n) * releaseAmount,
  }
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
