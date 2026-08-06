import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
import { usePrivy } from '@privy-io/react-auth'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

export default function StreamPayAccount() {
  const { authenticated, user, logout } = usePrivy()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  const email = user?.email?.address || 'Signed-in account'

  return (
    <section className="w-full max-w-2xl py-7 sm:py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Profile</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Account</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your HashPayStream identity and support.</p>
      <div className="mt-7 rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Signed in as</p>
        <p className="mt-2 break-all text-sm font-semibold text-gray-950 dark:text-white">{email}</p>
        <button type="button" onClick={() => void logout()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-xs font-semibold text-gray-700 dark:border-white/10 dark:text-gray-200 sm:w-auto">
          <ArrowRightStartOnRectangleIcon className="h-4 w-4" /> Sign out
        </button>
      </div>
      <a href="https://x.com/Hash_PayLink" target="_blank" rel="noreferrer" className="mt-4 block rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-medium text-gray-700 dark:border-white/10 dark:bg-[#18181b] dark:text-gray-200">Support on X</a>
    </section>
  )
}
