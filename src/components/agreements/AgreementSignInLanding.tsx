import { LockKeyhole } from 'lucide-react'
import { AuthButton } from '../../lib/AuthButton'
import type { HashPayStreamSplashState } from '../../lib/useHashPayStreamSessionSplash'
import { HashPayStreamMark } from '../HashPayStreamMark'

export function AgreementSignInLanding({ splashState }: { splashState: HashPayStreamSplashState }) {
  const splashActive = splashState !== 'idle'
  const assembled = splashState === 'assembling' || splashState === 'launching'
  const markVisible = splashState !== 'entering'
  const launching = splashState === 'launching'

  return (
    <section className="flex min-h-[64vh] w-full max-w-md flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
        <LockKeyhole className="h-5 w-5" />
      </div>
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Arc Agreements</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Your protected payments.</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
        Sign in to view and manage your agreements.
      </p>
      <AuthButton
        debugLabel="hashpaystream-agreements"
        className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.99] dark:bg-white dark:text-gray-950"
      >
        Continue with email
      </AuthButton>

      {splashActive && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 z-[100] bg-[#06070a] transition-opacity duration-700 ease-out motion-reduce:hidden ${launching ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
            <HashPayStreamMark className={`h-[72px] w-[72px] shrink-0 text-white transition-[opacity,transform] duration-500 ease-out ${markVisible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`} />
            <div className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity,transform] duration-[680ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${assembled ? 'ml-5 max-w-[18rem] translate-x-0 opacity-100' : 'ml-0 max-w-0 translate-x-5 opacity-0'}`}>
              <span className="text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">
                HashPay<span className="text-blue-500">Stream</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
