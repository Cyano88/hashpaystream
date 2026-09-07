import { getAddress, isAddress, type Address } from 'viem'
import { Capacitor } from '@capacitor/core'
import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric'

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
  let saved: { isSaved: boolean }
  try {
    saved = await NativeBiometric.isCredentialsSaved({ server })
  } catch {
    throw new Error('HashPayStream could not check the saved Circle wallet session.')
  }
  if (!saved.isSaved) return undefined
  let credentials: { username: string; password: string }
  try {
    credentials = await NativeBiometric.getCredentials({ server })
  } catch {
    throw new Error('The saved Circle wallet session could not be opened. Reconnect it to continue.')
  }
  if (credentials.username !== email.trim().toLowerCase()) {
    throw new Error('The saved Circle wallet session belongs to a different account.')
  }
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
  await NativeBiometric.setCredentials({
    server,
    username: session.email.trim().toLowerCase(),
    password: SECURE_SESSION_PREFIX + JSON.stringify({ ...session, savedAt }),
    accessControl: AccessControl.NONE,
  })
  const saved = await NativeBiometric.isCredentialsSaved({ server })
  if (!saved.isSaved) throw new Error('HashPayStream could not securely retain the Circle wallet session.')
  clearStoredCircleSession(storage)
}

export async function clearPersistedCircleSession(storage: StorageLike, appId: string, email: string) {
  clearStoredCircleSession(storage)
  if (!Capacitor.isNativePlatform() || !appId || !email) return
  await NativeBiometric.deleteCredentials({ server: secureServer(appId, email) }).catch(() => undefined)
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
