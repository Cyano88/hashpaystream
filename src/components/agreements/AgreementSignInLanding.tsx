import { ArrowRightIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import { AuthButton } from '../../lib/AuthButton'
import type { HashPayStreamSplashState } from '../../lib/useHashPayStreamSessionSplash'
import { HashPayStreamMark } from '../HashPayStreamMark'

export function AgreementSignInLanding({ splashState, compact = false }: { splashState: HashPayStreamSplashState; compact?: boolean }) {
  const splashActive = splashState !== 'idle'
  const assembled = splashState === 'assembling' || splashState === 'holding' || splashState === 'launching'
  const markVisible = splashState !== 'entering'
  const launching = splashState === 'launching'

  return (
    <section className={`flex w-full max-w-md flex-col items-center justify-center text-center ${compact ? 'min-h-0 lg:min-h-[64vh]' : 'min-h-[64vh]'}`}>
      <HashPayStreamMark className="h-14 w-14" title="HashPayStream" />
      <p className="mt-6 text-sm font-semibold tracking-tight">
        <span className="text-gray-950 dark:text-white">Hash</span>{' '}
        <span className="text-blue-600 dark:text-blue-400">PayStream</span>
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Your protected payments.</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
        Sign in to view and manage your agreements.
      </p>
      <AuthButton
        debugLabel="hashpaystream-agreements"
        className="group relative mt-7 flex min-h-14 w-full items-center justify-center rounded-2xl bg-gray-950 px-16 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-black active:translate-y-0 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
      >
        <EnvelopeIcon className="absolute left-5 h-4 w-4" />
        <span>Continue with email</span>
        <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 transition-transform group-hover:translate-x-0.5 dark:bg-black/[0.06]">
          <ArrowRightIcon className="h-4 w-4" />
        </span>
      </AuthButton>
      <a
        href="https://x.com/Hash_PayLink"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 text-xs text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
      >
        Support
      </a>
      <a
        href="https://testnet.arcscan.app"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300 transition-colors hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
      >
        Powered by Arc
      </a>

      {splashActive && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 z-[100] bg-[#06070a] transition-opacity duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:hidden md:hidden ${launching ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
            <HashPayStreamMark className={`h-11 w-11 shrink-0 text-white will-change-transform transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${markVisible ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-0'}`} />
            <div className={`overflow-hidden whitespace-nowrap will-change-transform transition-[max-width,margin,opacity,transform] duration-[880ms] ease-[cubic-bezier(0.16,1,0.3,1)] [&>span]:!text-[1.35rem] ${assembled ? 'ml-3 max-w-[11rem] translate-x-0 opacity-100' : 'ml-0 max-w-0 translate-x-3 opacity-0'}`}>
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
