import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { W3SSdk as CircleSdk } from '@circle-fin/w3s-pw-web-sdk'
import { createPublicClient, formatUnits, getAddress, http, parseUnits, type Address, type Hex } from 'viem'
import { ARC_USDC, ARC_USDC_ABI, arcTestnet } from './arcWallet'

type CircleWallet = { id: string; address: Address; blockchain: string; accountType?: string; state?: string }
type CircleSession = { userToken: string; encryptionKey: string; refreshToken?: string; deviceId: string; wallet: CircleWallet }
type WalletState = 'idle' | 'connecting' | 'ready' | 'error'
type CircleWalletContextValue = {
  state: WalletState; error: string; session?: CircleSession; address: string; balance: string; loadingBalance: boolean
  reconnect: () => Promise<void>; refreshBalance: () => Promise<void>; sendUsdc: (recipient: Address, amount: string) => Promise<Hex>
}

const Context = createContext<CircleWalletContextValue | null>(null)
const APP_ID = String(import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET ?? import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID ?? '').trim()
const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

function apiError(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : typeof value === 'string' ? value : fallback
}
function find(value: unknown, names: string[]): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const name of names) if (typeof record[name] === 'string' && record[name]) return String(record[name])
  for (const nested of Object.values(record)) { const result = find(nested, names); if (result) return result }
  return ''
}

export function CircleWalletProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy()
  const email = user?.email?.address?.trim().toLowerCase() ?? ''
  const [state, setState] = useState<WalletState>('idle')
  const [error, setError] = useState('')
  const [session, setSession] = useState<CircleSession>()
  const [balance, setBalance] = useState('0')
  const [loadingBalance, setLoadingBalance] = useState(false)
  const connecting = useRef<Promise<void> | null>(null)

  const request = useCallback(async (payload: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to open your Circle wallet.')
    const response = await fetch('/api/hashpaystream/v1/circle-wallet', {
      method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string }
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Circle wallet request failed.')
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
      setState('connecting'); setError(''); setSession(undefined)
      try {
        if (!APP_ID) throw new Error('Circle Arc wallet is not configured.')
        if (!authenticated || !email) throw new Error('Sign in with email to open your Circle wallet.')
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        const sdk = new W3SSdk({ appSettings: { appId: APP_ID } })
        const deviceId = (await sdk.getDeviceId()).trim()
        if (!deviceId) throw new Error('Circle could not identify this device.')
        let otp = await request({ action: 'request_email_otp', email, deviceId }) as { deviceToken?: string; deviceEncryptionKey?: string; otpToken?: string }
        const login = await new Promise<{ userToken: string; encryptionKey: string; refreshToken?: string }>((resolve, reject) => {
          const finish = (failure?: unknown, result?: { userToken?: string; encryptionKey?: string; refreshToken?: string }) => {
            if (failure) reject(new Error(apiError(failure, 'Circle email verification did not complete.')))
            else if (!result?.userToken || !result.encryptionKey) reject(new Error('Circle email verification did not return a wallet session.'))
            else resolve({ userToken: result.userToken, encryptionKey: result.encryptionKey, refreshToken: result.refreshToken })
          }
          const configure = () => sdk.updateConfigs({ appSettings: { appId: APP_ID }, loginConfigs: { deviceToken: String(otp.deviceToken), deviceEncryptionKey: String(otp.deviceEncryptionKey), otpToken: String(otp.otpToken) } }, finish)
          sdk.setOnResendOtpEmail(() => { void request({ action: 'request_email_otp', email, deviceId }).then(next => { otp = next as typeof otp; configure() }).catch(reject) })
          configure()
          try { sdk.verifyOtp() } catch (reason) { reject(reason) }
        })
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
        const linked = await fetch('/api/hashpaystream/v1/accounts', { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'register_wallet', walletAddress: verifiedWallet.address, circleUserToken: login.userToken }) })
        if (!linked.ok) { const body = await linked.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || 'Circle wallet could not be linked to HashPayStream.') }
        setSession({ ...login, deviceId, wallet: verifiedWallet })
        setState('ready')
      } catch (reason) {
        setError(apiError(reason, 'Circle wallet sign-in did not finish.'))
        setState('error')
      }
    })().finally(() => { connecting.current = null })
    connecting.current = operation
    return operation
  }, [authenticated, email, execute, getAccessToken, request])

  useEffect(() => {
    if (!ready || !authenticated || !email) { setState('idle'); setSession(undefined); return }
    const timer = window.setTimeout(() => { void reconnect() }, 350)
    return () => window.clearTimeout(timer)
  }, [authenticated, email, ready, reconnect])

  const refreshBalance = useCallback(async () => {
    if (!session?.wallet.address) { setBalance('0'); return }
    setLoadingBalance(true)
    try {
      const units = await publicClient.readContract({ address: ARC_USDC, abi: ARC_USDC_ABI, functionName: 'balanceOf', args: [session.wallet.address] })
      setBalance(formatUnits(units, 6))
    } catch { setBalance('0') } finally { setLoadingBalance(false) }
  }, [session?.wallet.address])
  useEffect(() => { if (state === 'ready') void refreshBalance() }, [refreshBalance, state])

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

  const value = useMemo(() => ({ state, error, session, address: session?.wallet.address ?? '', balance, loadingBalance, reconnect, refreshBalance, sendUsdc }), [balance, error, loadingBalance, reconnect, refreshBalance, sendUsdc, session, state])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCircleWallet() {
  const value = useContext(Context)
  if (!value) throw new Error('CircleWalletProvider is missing.')
  return value
}
