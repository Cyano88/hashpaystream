import { LockClosedIcon } from '@heroicons/react/24/outline'
import { useCircleWallet } from '../lib/circleWallet'

export function CircleWalletGate({ children }: { children: React.ReactNode }) {
  const wallet = useCircleWallet()
  if (wallet.state === 'ready') return children
  return <main className="fixed inset-0 z-[60] flex items-center justify-center bg-[#F5F5F7] px-6 text-gray-950 dark:bg-[#111113] dark:text-white">
    <section className="w-full max-w-[360px] text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white"><LockClosedIcon className="h-5 w-5" /></span>
      <h1 className="mt-5 text-xl font-extrabold tracking-tight">Signing in to your Circle wallet</h1>
      <p className="mx-auto mt-2 max-w-[300px] text-sm leading-6 text-gray-500 dark:text-gray-400">Use the Circle code sent to your HashPayStream email.</p>
      {wallet.state === 'error' ? <><p className="mt-4 text-xs font-semibold leading-5 text-red-600 dark:text-red-300">{wallet.error}</p><button type="button" onClick={() => void wallet.reconnect()} className="mt-5 min-h-11 rounded-full px-5 text-sm font-bold text-blue-600">Try Circle sign-in again</button></> : <span className="mx-auto mt-6 flex w-14 justify-between" aria-label="Opening Circle wallet">{[0,1,2].map(index => <span key={index} className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600" style={{ animationDelay: `${index * 140}ms` }} />)}</span>}
    </section>
  </main>
}
