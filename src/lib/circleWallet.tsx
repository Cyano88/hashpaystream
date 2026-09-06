import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { Capacitor } from '@capacitor/core'
import type { W3SSdk as CircleSdk } from '@circle-fin/w3s-pw-web-sdk'
import { formatUnits, getAddress, parseUnits, type Address, type Hex } from 'viem'
import { clearPersistedCircleSession, readPersistedCircleSession, writePersistedCircleSession } from './circleSession'
import { fetchWithTimeout } from './fetchWithTimeout'

type CircleWallet = { id: string; address: Address; blockchain: string; accountType?: string; state?: string }
type CircleSession = { userToken: string; encryptionKey: string; refreshToken?: string; deviceId: string; wallet: CircleWallet }
type WalletState = 'idle' | 'connecting' | 'ready' | 'error'
type ConnectionStage = 'restoring' | 'verifying'
type CircleWalletContextValue = {
  state: WalletState; stage: ConnectionStage; error: string; session?: CircleSession; address: string; balance: string; balanceReady: boolean; balanceError: string; loadingBalance: boolean
  reconnect: () => Promise<void>; reauthorize: () => Promise<void>; refreshBalance: () => Promise<void>; sendUsdc: (recipient: Address, amount: string) => Promise<Hex>
  executeChallenge: (challengeId: string) => Promise<{ transactionHash: string }>
}

const Context = createContext<CircleWalletContextValue | null>(null)
const APP_ID = String(import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET ?? import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID ?? '').trim()
const NATIVE_ORIGIN = 'https://hashpaystream.app'
const DEVICE_ID_STORAGE_PREFIX = 'hashpaystream:circle-device-id:v1'
const EMAIL_VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000
const NATIVE_SESSION_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000
const BALANCE_STORAGE_PREFIX = 'hashpaystream:arc-usdc:v1'

class CircleRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function apiError(value: unknown, fallback: string) {
  if (value instanceof Error && value.message) return value.message
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['message', 'error', 'detail', 'code']) {
      if (typeof record[key] === 'string' && record[key]) return record[key].slice(0, 220)
      if (typeof record[key] === 'number') return `Circle error ${record[key]}`
    }
    try {
      const serialized = JSON.stringify(value)
      if (serialized && serialized !== '{}') return serialized.slice(0, 220)
    } catch { /* use the safe fallback */ }
  }
  return fallback
}
function find(value: unknown, names: string[]): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const name of names) if (typeof record[name] === 'string' && record[name]) return String(record[name])
  for (const nested of Object.values(record)) { const result = find(nested, names); if (result) return result }
  return ''
}

function runtimeUrl(path: string) { return Capacitor.isNativePlatform() ? `${NATIVE_ORIGIN}${path}` : path }
function closeCircleSdkModal() { window.document.getElementById('sdkIframe')?.remove() }
function deviceIdKey() { return `${DEVICE_ID_STORAGE_PREFIX}:${APP_ID}` }
function readDeviceId() {
  try { return window.localStorage.getItem(deviceIdKey())?.trim() || '' } catch { return '' }
}
function saveDeviceId(deviceId: string) {
  try { window.localStorage.setItem(deviceIdKey(), deviceId) } catch { /* available for this session only */ }
}
function readCachedBalance(email: string) {
  if (!email) return ''
  try { const value = window.localStorage.getItem(`${BALANCE_STORAGE_PREFIX}:${email}`) ?? ''; return /^\d+(?:\.\d{1,6})?$/.test(value) ? value : '' } catch { return '' }
}
function saveCachedBalance(email: string, balance: string) {
  if (!email) return
  try { window.localStorage.setItem(`${BALANCE_STORAGE_PREFIX}:${email}`, balance) } catch { /* optional */ }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then((value) => { window.clearTimeout(timer); resolve(value) }, (reason) => { window.clearTimeout(timer); reject(reason) })
  })
}
async function getCircleDeviceId(sdk: CircleSdk) {
  const cached = readDeviceId()
  if (cached) return cached
  let deviceId = ''
  try {
    deviceId = (await withTimeout(sdk.getDeviceId(), 15_000, 'Circle wallet security could not start.')).trim()
  } catch {
    closeCircleSdkModal()
    deviceId = window.crypto.randomUUID()
  }
  if (!deviceId) throw new Error('Circle could not identify this device.')
  saveDeviceId(deviceId)
  return deviceId
}

export function CircleWalletProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy()
  const email = user?.email?.address?.trim().toLowerCase() ?? ''
  const [state, setState] = useState<WalletState>('idle')
  const [stage, setStage] = useState<ConnectionStage>('restoring')
  const [error, setError] = useState('')
  const [session, setSession] = useState<CircleSession>()
  const cachedBalance = readCachedBalance(email)
  const [balance, setBalance] = useState(() => cachedBalance || '0')
  const [balanceReady, setBalanceReady] = useState(() => Boolean(cachedBalance))
  const [balanceError, setBalanceError] = useState('')
  const [loadingBalance, setLoadingBalance] = useState(false)
  const connecting = useRef<Promise<void> | null>(null)
  const forceEmailVerification = useRef(false)
  const activeEmail = useRef('')
  const balanceReadyRef = useRef(Boolean(cachedBalance))
  const balanceRefresh = useRef<Promise<void> | null>(null)

  const request = useCallback(async (payload: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to open your Circle wallet.')
    const response = await fetchWithTimeout(runtimeUrl('/api/hashpaystream/v1/circle-wallet'), {
      method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string }
    if (!response.ok || data.ok === false) throw new CircleRequestError(data.error || 'Circle wallet request failed.', response.status)
    return data
  }, [getAccessToken])

  const execute = useCallback((sdk: CircleSdk, challengeId: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
    sdk.execute(challengeId, (failure, result) => {
      if (failure) reject(new Error(apiError(failure, 'Circle wallet approval did not complete.')))
      else if (!result) reject(new Error('Circle wallet approval did not return a result.'))
      else resolve(result as unknown as Record<string, unknown>)
    })
  }), [])

  const reconnect = useCallback(async () => {
    if (connecting.current) return connecting.current
    const operation = (async () => {
      setState('connecting'); setStage('restoring'); setError(''); setSession(undefined)
      try {
        if (!APP_ID) throw new Error('Circle Arc wallet is not configured.')
        if (!authenticated || !email) throw new Error('Sign in with email to open your Circle wallet.')
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        const sdk = new W3SSdk({ appSettings: { appId: APP_ID } })
        const deviceId = await getCircleDeviceId(sdk)

        const stored = forceEmailVerification.current ? undefined : await readPersistedCircleSession(window.localStorage, APP_ID, email, deviceId)
        forceEmailVerification.current = false
        if (stored) {
          if (Capacitor.isNativePlatform() && stored.encryptionKey && stored.savedAt && Date.now() - stored.savedAt < NATIVE_SESSION_REFRESH_INTERVAL_MS) {
            sdk.setAuthentication({ userToken: stored.userToken, encryptionKey: stored.encryptionKey })
            setSession({ userToken: stored.userToken, encryptionKey: stored.encryptionKey, refreshToken: stored.refreshToken, deviceId, wallet: stored.wallet })
            setState('ready')
            return
          }
          if (stored.refreshToken) {
            try {
              const refreshed = await request({ action: 'refresh_session', userToken: stored.userToken, refreshToken: stored.refreshToken, deviceId }) as { userToken?: string; encryptionKey?: string; refreshToken?: string }
              if (!refreshed.userToken || !refreshed.encryptionKey) throw new Error('Circle did not return a refreshed wallet session.')
              const restoredSession: CircleSession = {
                userToken: refreshed.userToken,
                encryptionKey: refreshed.encryptionKey,
                refreshToken: refreshed.refreshToken || stored.refreshToken,
                deviceId,
                wallet: stored.wallet,
              }
              await writePersistedCircleSession(window.localStorage, { version: 1, appId: APP_ID, email, userToken: restoredSession.userToken, encryptionKey: restoredSession.encryptionKey, refreshToken: restoredSession.refreshToken!, deviceId, wallet: stored.wallet })
              sdk.setAuthentication({ userToken: restoredSession.userToken, encryptionKey: restoredSession.encryptionKey })
              const snapshot = await request({ action: 'list_wallets', userToken: restoredSession.userToken })
              const wallet = snapshot.wallet as CircleWallet | null
              if (!wallet?.id || !wallet.address || getAddress(wallet.address) !== stored.wallet.address) throw new Error('The restored Circle wallet does not match this account.')
              restoredSession.wallet = { ...wallet, address: getAddress(wallet.address) }
              await writePersistedCircleSession(window.localStorage, { version: 1, appId: APP_ID, email, userToken: restoredSession.userToken, encryptionKey: restoredSession.encryptionKey, refreshToken: restoredSession.refreshToken!, deviceId, wallet: restoredSession.wallet })
              setSession(restoredSession)
              setState('ready')
              return
            } catch (reason) {
              // A temporary relaunch failure must not become a surprise OTP.
              // Keep the encrypted device-bound session; invalid credentials
              // still fail closed and require an explicit reconnect.
              if (Capacitor.isNativePlatform() && stored.encryptionKey && !/HTTP (?:401|403)|(?:refresh|user|session) token.{0,60}(?:invalid|expired|revoked|already used)|(?:invalid|expired|revoked).{0,60}(?:refresh|user|session) token|session credentials are invalid|unauthori[sz]ed/i.test(apiError(reason, ''))) {
                sdk.setAuthentication({ userToken: stored.userToken, encryptionKey: stored.encryptionKey })
                setSession({ userToken: stored.userToken, encryptionKey: stored.encryptionKey, refreshToken: stored.refreshToken, deviceId, wallet: stored.wallet })
                setState('ready')
                return
              }
              throw reason
            }
          } else {
            await clearPersistedCircleSession(window.localStorage, APP_ID, email)
          }
        }

        setStage('verifying')
        let otp = await request({ action: 'request_email_otp', email, deviceId }) as { deviceToken?: string; deviceEncryptionKey?: string; otpToken?: string }
        const login = await withTimeout(new Promise<{ userToken: string; encryptionKey: string; refreshToken?: string }>((resolve, reject) => {
          const finish = (failure?: unknown, result?: { userToken?: string; encryptionKey?: string; refreshToken?: string }) => {
            if (failure) reject(new Error(apiError(failure, 'Circle email verification did not complete.')))
            else if (!result?.userToken || !result.encryptionKey) reject(new Error('Circle email verification did not return a wallet session.'))
            else resolve({ userToken: result.userToken, encryptionKey: result.encryptionKey, refreshToken: result.refreshToken })
          }
          const configure = () => {
            if (!otp.deviceToken || !otp.deviceEncryptionKey || !otp.otpToken) { reject(new Error('Circle did not return valid email verification credentials.')); return }
            sdk.updateConfigs({ appSettings: { appId: APP_ID }, loginConfigs: { deviceToken: otp.deviceToken, deviceEncryptionKey: otp.deviceEncryptionKey, otpToken: otp.otpToken } }, finish)
          }
          sdk.setOnResendOtpEmail(() => { void request({ action: 'request_email_otp', email, deviceId }).then(next => { otp = next as typeof otp; configure() }).catch(reject) })
          configure()
          try { sdk.verifyOtp() } catch (reason) { reject(reason) }
        }), EMAIL_VERIFICATION_TIMEOUT_MS, 'Circle code entry timed out. Request a new code and try again.')
        sdk.setAuthentication({ userToken: login.userToken, encryptionKey: login.encryptionKey })
        const list = async () => request({ action: 'list_wallets', userToken: login.userToken })
        let snapshot = await list()
        let wallet = snapshot.wallet as CircleWallet | null
        if (!wallet) {
          try {
            const initialized = await request({ action: 'initialize_user', userToken: login.userToken })
            const challengeId = find(initialized, ['challengeId'])
            if (challengeId) await execute(sdk, challengeId)
          } catch (reason) {
            if (!/already initialized/i.test(apiError(reason, ''))) throw reason
          }
          snapshot = await list(); wallet = snapshot.wallet as CircleWallet | null
        }
        if (!wallet) {
          const created = await request({ action: 'create_wallet', userToken: login.userToken })
          const challengeId = find(created, ['challengeId'])
          if (!challengeId) throw new Error('Circle did not return a wallet creation challenge.')
          await execute(sdk, challengeId)
          snapshot = await list(); wallet = snapshot.wallet as CircleWallet | null
        }
        if (!wallet?.id || !wallet.address) throw new Error('Circle Arc wallet is not ready yet.')
        const verifiedWallet = { ...wallet, address: getAddress(wallet.address) }
        const accessToken = await getAccessToken()
        if (!accessToken) throw new Error('HashPayStream session expired while linking Circle.')
        const linked = await fetchWithTimeout(runtimeUrl('/api/hashpaystream/v1/accounts'), { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'register_wallet', walletAddress: verifiedWallet.address, circleUserToken: login.userToken }) })
        if (!linked.ok) { const body = await linked.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || 'Circle wallet could not be linked to HashPayStream.') }
        setSession({ ...login, deviceId, wallet: verifiedWallet })
        if (login.refreshToken) await writePersistedCircleSession(window.localStorage, { version: 1, appId: APP_ID, email, userToken: login.userToken, encryptionKey: login.encryptionKey, refreshToken: login.refreshToken, deviceId, wallet: verifiedWallet })
        setState('ready')
      } catch (reason) {
        closeCircleSdkModal()
        setError(apiError(reason, 'Circle wallet sign-in did not finish.'))
        setState('error')
      }
    })().finally(() => { connecting.current = null })
    connecting.current = operation
    return operation
  }, [authenticated, email, execute, getAccessToken, request])

  const reauthorize = useCallback(async () => {
    await clearPersistedCircleSession(window.localStorage, APP_ID, email)
    forceEmailVerification.current = true
    await reconnect()
  }, [email, reconnect])

  useEffect(() => {
    if (!ready) return
    if (!authenticated || !email) {
      activeEmail.current = ''
      setState('idle')
      setSession(undefined)
      setBalance('0')
      setBalanceError('')
      balanceReadyRef.current = false
      setBalanceReady(false)
      return
    }
    if (activeEmail.current && activeEmail.current !== email) {
      void clearPersistedCircleSession(window.localStorage, APP_ID, activeEmail.current)
      setState('idle')
      setSession(undefined)
      const nextCachedBalance = readCachedBalance(email)
      setBalance(nextCachedBalance || '0')
      setBalanceError('')
      balanceReadyRef.current = Boolean(nextCachedBalance)
      setBalanceReady(Boolean(nextCachedBalance))
    }
    if (!activeEmail.current && !balanceReadyRef.current) {
      const nextCachedBalance = readCachedBalance(email)
      if (nextCachedBalance) {
        setBalance(nextCachedBalance)
        balanceReadyRef.current = true
        setBalanceReady(true)
      }
    }
    activeEmail.current = email
  }, [authenticated, email, ready])

  const refreshBalance = useCallback(async () => {
    if (balanceRefresh.current) return balanceRefresh.current
    if (!session?.wallet.address) {
      setBalance('0'); setBalanceError(''); balanceReadyRef.current = false; setBalanceReady(false)
      return
    }
    const operation = (async () => {
      const foreground = !balanceReadyRef.current
      if (foreground) setLoadingBalance(true)
      try {
        const result = await request({ action: 'get_balance', userToken: session.userToken, walletId: session.wallet.id, walletAddress: session.wallet.address })
        const units = find(result, ['balanceUsdcUnits'])
        if (!/^\d+$/.test(units)) throw new Error('Arc returned an invalid USDC balance.')
        const nextBalance = formatUnits(BigInt(units), 6)
        saveCachedBalance(email, nextBalance)
        setBalance(nextBalance)
        balanceReadyRef.current = true
        setBalanceReady(true)
        setBalanceError('')
      } catch (reason) {
        if (!balanceReadyRef.current) setBalanceError(apiError(reason, 'Arc USDC balance is temporarily unavailable.'))
      } finally {
        if (foreground) setLoadingBalance(false)
      }
    })().finally(() => { balanceRefresh.current = null })
    balanceRefresh.current = operation
    return operation
  }, [request, session])
  useEffect(() => {
    if (state !== 'ready') return
    void refreshBalance()
    const timer = window.setInterval(() => void refreshBalance(), 15_000)
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshBalance() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshBalance, state])

  const sendUsdc = useCallback(async (recipient: Address, amount: string) => {
    if (!session) throw new Error('Open your Circle wallet first.')
    const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
    const sdk = new W3SSdk({ appSettings: { appId: APP_ID } })
    sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey })
    const prepared = await request({ action: 'send_usdc', userToken: session.userToken, walletId: session.wallet.id, walletAddress: session.wallet.address, recipient, amountUnits: parseUnits(amount, 6).toString() })
    const challengeId = find(prepared, ['challengeId'])
    if (!challengeId) throw new Error('Circle did not return a payment challenge.')
    const result = await execute(sdk, challengeId)
    let hash = find(result, ['txHash', 'transactionHash'])
    const transactionId = find(result, ['transactionId']) || find(prepared, ['transactionId', 'id'])
    for (let attempt = 0; !hash && transactionId && attempt < 40; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 2_500))
      const transaction = await request({ action: 'get_transaction', userToken: session.userToken, transactionId })
      hash = find(transaction, ['txHash', 'transactionHash'])
      const status = find(transaction, ['state', 'status']).toUpperCase()
      if (status.includes('FAILED') || status.includes('CANCEL')) throw new Error('Circle wallet transfer did not complete.')
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error('Circle approved the transfer, but its transaction hash is not available yet.')
    await refreshBalance()
    return hash as Hex
  }, [execute, refreshBalance, request, session])

  const executeChallenge = useCallback(async (challengeId: string) => {
    if (!session) throw new Error('Open your Circle wallet first.')
    if (!challengeId.trim()) throw new Error('Circle confirmation is unavailable.')
    const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
    const sdk = new W3SSdk({ appSettings: { appId: APP_ID } })
    sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey })
    const result = await execute(sdk, challengeId)
    return { transactionHash: find(result, ['txHash', 'transactionHash']) }
  }, [execute, session])

  const value = useMemo(() => ({ state, stage, error, session, address: session?.wallet.address ?? '', balance, balanceReady, balanceError, loadingBalance, reconnect, reauthorize, refreshBalance, sendUsdc, executeChallenge }), [balance, balanceError, balanceReady, error, executeChallenge, loadingBalance, reauthorize, reconnect, refreshBalance, sendUsdc, session, stage, state])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCircleWallet() {
  const value = useContext(Context)
  if (!value) throw new Error('CircleWalletProvider is missing.')
  return value
}
