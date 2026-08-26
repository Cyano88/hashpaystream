import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { useCircleWallet } from '../lib/circleWallet'
import { clearStoredCircleSession } from '../lib/circleSession'

const RETRY_DELAY_MS = 10_000

export function CircleWalletGate({ children }: { children: React.ReactNode }) {
  const wallet = useCircleWallet()
  const { logout } = usePrivy()
  const [retryVisible, setRetryVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (wallet.state === 'ready' || wallet.state === 'error') {
      setRetryVisible(wallet.state === 'error')
      return
    }
    setRetryVisible(false)
    const timer = window.setTimeout(() => setRetryVisible(true), RETRY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [wallet.stage, wallet.state])
  if (wallet.state === 'ready') return children
  async function useAnotherEmail() {
    if (leaving) return
    setLeaving(true)
    clearStoredCircleSession(window.localStorage)
    try { await logout() } finally { window.location.replace('/') }
  }
  return (
    <main className="fixed inset-0 z-[160] overflow-y-auto bg-[#F5F5F7] px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-gray-950 dark:bg-[#111113] dark:text-white">
      <button type="button" disabled={leaving} onClick={() => void useAnotherEmail()} aria-label="Back to email sign in" className="fixed left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-950 shadow-sm transition active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.07] dark:text-white"><ArrowLeftIcon className="h-5 w-5" /></button>
      <section className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[360px] flex-col justify-center py-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white"><LockClosedIcon className="h-5 w-5" /></span>
        <h1 className="mt-5 text-xl font-extrabold tracking-tight">{wallet.stage === 'verifying' ? 'Verify your Circle wallet' : 'Opening your Circle wallet'}</h1>
        <p className="mx-auto mt-2 max-w-[300px] text-sm leading-6 text-gray-500 dark:text-gray-400">{wallet.stage === 'verifying' ? 'Use the Circle code sent to your HashPayStream email.' : 'Restoring your secure wallet session.'}</p>
        {wallet.state === 'error' ? <p role="alert" className="mt-4 text-xs font-semibold leading-5 text-red-600 dark:text-red-300">{wallet.error}</p> : <span className="mx-auto mt-6 flex w-14 justify-between" aria-label="Opening Circle wallet">{[0, 1, 2].map(index => <span key={index} className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600" style={{ animationDelay: `${index * 140}ms` }} />)}</span>}
        {retryVisible && <div className="mt-6">{wallet.state !== 'error' && <p className="mb-3 text-xs leading-5 text-gray-500 dark:text-gray-400">Taking longer than expected?</p>}<button type="button" onClick={() => window.location.reload()} className="min-h-12 w-full rounded-full bg-gray-950 px-6 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] dark:bg-white dark:text-gray-950">Try again</button></div>}
        <button type="button" disabled={leaving} onClick={() => void useAnotherEmail()} className="mx-auto mt-4 min-h-10 px-4 text-xs font-bold text-gray-500 disabled:opacity-50 dark:text-gray-400">{leaving ? 'Signing out...' : 'Use another email'}</button>
      </section>
    </main>
  )
}
