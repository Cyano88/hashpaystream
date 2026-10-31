import { useEffect, useRef, useState } from 'react'
import { circleBiometricUnlockStatus, enableCircleBiometricUnlock } from '../lib/circleSession'
import { useCircleWallet } from '../lib/circleWallet'
import { usePrivy } from '@privy-io/react-auth'
import { FingerPrintIcon } from '@heroicons/react/24/outline'
const appId = String(import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET ?? import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID ?? '').trim()
export default function WalletBiometricUnlock() {
  const { user } = usePrivy()
  return user ? <Unlock key={user.id} email={user.email?.address?.trim().toLowerCase() || ''} /> : null
}
function Unlock({ email }: { email: string }) {
  const wallet = useCircleWallet(), alive = useRef(true), lock = useRef(false)
  const [status, setStatus] = useState({ available: false, enabled: false }), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { alive.current = true; void circleBiometricUnlockStatus(appId, email).then(value => { if (alive.current) setStatus(value) }).catch(() => undefined); return () => { alive.current = false } }, [email])
  async function enable() {
    if (lock.current || !wallet.session?.refreshToken) return
    lock.current = true; setBusy(true); setError('')
    try {
      const session = wallet.session
      await enableCircleBiometricUnlock(window.localStorage, { ...session, version: 1, appId, email, refreshToken: session.refreshToken! })
      if (alive.current) setStatus({ available: true, enabled: true })
    } catch { if (alive.current) setError('Wallet unlock was not enabled. Try again, or keep using email verification.') }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  if (!status.available && !status.enabled) return null
  return <div className="border-t border-gray-100 px-4 py-4 dark:border-white/[0.07]">
    <button type="button" disabled={busy || status.enabled || !wallet.session?.refreshToken} onClick={() => void enable()} className="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-60">
      <FingerPrintIcon className="h-5 w-5 text-gray-500" />
      <span><span className="block text-sm font-bold">Fingerprint or face unlock</span><span className="mt-1 block text-xs text-gray-500">{status.enabled ? 'Enabled for your saved wallet session' : busy ? 'Setting up wallet unlock...' : 'Unlock your wallet when reopening the app'}</span></span>
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </div>
}
