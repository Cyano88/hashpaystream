import { getAddress, isAddress, type Address } from 'viem'
import { Capacitor } from '@capacitor/core'
import { circleBiometricVault } from './circleBiometricVault'

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
  encryptionKey?: string
  deviceId: string
  wallet: StoredCircleWallet
  savedAt?: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const STORAGE_KEY = 'hashpaystream.circleSession.v1'
const SECURE_SESSION_PREFIX = 'hashpaystream-circle-session-v1:'

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
      ...(text(parsed.encryptionKey, 8_000) ? { encryptionKey: text(parsed.encryptionKey, 8_000) } : {}),
      ...(typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? { savedAt: parsed.savedAt } : {}),
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

function secureServer(appId: string, email: string) {
  return `app.hashpaystream.circle.${appId}.${email.trim().toLowerCase()}`
}

function parseSession(raw: string, appId: string, email: string, deviceId: string) {
  let value = raw
  if (value.startsWith(SECURE_SESSION_PREFIX)) value = value.slice(SECURE_SESSION_PREFIX.length)
  return readStoredCircleSession({
    getItem: () => value,
    setItem: () => undefined,
    removeItem: () => undefined,
  }, appId, email, deviceId)
}

export async function readPersistedCircleSession(storage: StorageLike, appId: string, email: string, deviceId: string) {
  if (!Capacitor.isNativePlatform()) return readStoredCircleSession(storage, appId, email, deviceId)
  const server = secureServer(appId, email)
  const credentials = await circleBiometricVault.read(server, email.trim().toLowerCase())
  if (!credentials) return undefined
  const session = parseSession(credentials.password, appId, email, deviceId)
  if (!session) throw new Error('The saved Circle wallet session is invalid. Reconnect it to continue.')
  return session
}

export async function writePersistedCircleSession(storage: StorageLike, session: StoredCircleSession & { encryptionKey: string }) {
  const savedAt = Date.now()
  if (!Capacitor.isNativePlatform()) {
    writeStoredCircleSession(storage, { ...session, encryptionKey: undefined, savedAt: undefined })
    return
  }
  const server = secureServer(session.appId, session.email)
  await circleBiometricVault.write(server, session.email.trim().toLowerCase(), SECURE_SESSION_PREFIX + JSON.stringify({ ...session, savedAt }))
  clearStoredCircleSession(storage)
}

export async function clearPersistedCircleSession(storage: StorageLike, appId: string, email: string) {
  clearStoredCircleSession(storage)
  if (!Capacitor.isNativePlatform() || !appId || !email) return
  await circleBiometricVault.clear(secureServer(appId, email))
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

export async function circleBiometricUnlockStatus(appId: string, email: string) {
  if (!Capacitor.isNativePlatform() || !appId || !email) return { available: false, enabled: false }
  return { available: await circleBiometricVault.available(), enabled: await circleBiometricVault.enabled(secureServer(appId, email)) }
}
export async function enableCircleBiometricUnlock(storage: StorageLike, session: StoredCircleSession & { encryptionKey: string }) {
  if (!Capacitor.isNativePlatform() || !session.refreshToken || !session.encryptionKey) throw Error('Verify your Circle wallet on this phone first.')
  await circleBiometricVault.enable(secureServer(session.appId, session.email), session.email.trim().toLowerCase(), SECURE_SESSION_PREFIX + JSON.stringify({ ...session, savedAt: Date.now() }))
  clearStoredCircleSession(storage)
}
export function lockCircleBiometricMemory() { circleBiometricVault.lock() }

export function canReuseNativeCircleSession(session: StoredCircleSession, now = Date.now()) {
  if (!session.encryptionKey || !session.savedAt || now < session.savedAt || now - session.savedAt >= 12 * 60 * 60 * 1000) return false
  const expiresAt = circleUserTokenExpiresAt(session.userToken)
  return !expiresAt || expiresAt > now + 60_000
}
