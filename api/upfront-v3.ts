export const UPFRONT_V3_FLAG = 'HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED'

export function upfrontSettlementV3Enabled(env: NodeJS.ProcessEnv) {
  return String(env[UPFRONT_V3_FLAG] ?? '').trim().toLowerCase() === 'true'
}

export function requireUpfrontSettlementV3(env: NodeJS.ProcessEnv): void {
  if (!upfrontSettlementV3Enabled(env)) {
    throw Object.assign(new Error('Early pay is paused while the settlement upgrade is verified.'), { status: 503 })
  }
}
