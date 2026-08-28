export const MIN_UPFRONT_DURATION_SECONDS = 86_400
export const DEFAULT_MIN_UPFRONT_REMAINING_SECONDS = 21_600

export function minimumUpfrontRemainingSeconds(env: NodeJS.ProcessEnv) {
  const parsed = Number(String(env.HASHPAYSTREAM_UPFRONT_MIN_REMAINING_SECONDS ?? DEFAULT_MIN_UPFRONT_REMAINING_SECONDS).trim())
  return Number.isInteger(parsed) && parsed >= 3_600 && parsed <= 86_400
    ? parsed
    : DEFAULT_MIN_UPFRONT_REMAINING_SECONDS
}

export function hasMinimumUpfrontProtectionWindow(protectionDeadline: number, now: Date, minimumSeconds: number) {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  return Number.isSafeInteger(protectionDeadline)
    && Number.isSafeInteger(nowSeconds)
    && protectionDeadline - nowSeconds >= minimumSeconds
}