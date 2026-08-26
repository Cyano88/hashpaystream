import { getAddress, isAddress, type Address } from 'viem'

export type StoredCircleWallet = {
  id: string
  address: Address
  blockchain: string
  accountType?: string
  state?: string
}

export type StoredCircleSession = {
  version: 1
  appId: string
  email: string
  userToken: string
  refreshToken: string
  deviceId: string
  wallet: StoredCircleWallet
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const STORAGE_KEY = 'hashpaystream.circleSession.v1'

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function readStoredCircleSession(storage: StorageLike, appId: string, email: string, deviceId: string): StoredCircleSession | undefined {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredCircleSession> | null
    const wallet = parsed?.wallet
    if (parsed?.version !== 1 || text(parsed.appId, 256) !== appId || text(parsed.email, 254).toLowerCase() !== email || text(parsed.deviceId, 256) !== deviceId || !text(parsed.userToken, 8_000) || !text(parsed.refreshToken, 8_000) || !wallet || !text(wallet.id, 256) || !isAddress(wallet.address)) return undefined
    return {
      version: 1, appId, email, userToken: text(parsed.userToken, 8_000), refreshToken: text(parsed.refreshToken, 8_000), deviceId,
      wallet: {
        id: text(wallet.id, 256), address: getAddress(wallet.address), blockchain: text(wallet.blockchain, 40),
        ...(text(wallet.accountType, 20) ? { accountType: text(wallet.accountType, 20) } : {}),
        ...(text(wallet.state, 20) ? { state: text(wallet.state, 20) } : {}),
      },
    }
  } catch { return undefined }
}

export function writeStoredCircleSession(storage: StorageLike, session: StoredCircleSession) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(session)) } catch { /* Storage can be unavailable in privacy modes. */ }
}

export function clearStoredCircleSession(storage: StorageLike) {
  try { storage.removeItem(STORAGE_KEY) } catch { /* Storage can be unavailable in privacy modes. */ }
}

export function circleUserTokenExpiresAt(userToken: string) {
  try {
    const payload = userToken.split('.')[1]
    if (!payload) return 0
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { exp?: unknown }
    return typeof decoded.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp * 1_000 : 0
  } catch { return 0 }
}
