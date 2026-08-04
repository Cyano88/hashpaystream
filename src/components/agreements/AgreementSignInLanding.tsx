import { ArrowRight, Check, LockKeyhole, Mail } from 'lucide-react'
import { AuthButton } from '../../lib/AuthButton'
import type { HashPayStreamSplashState } from '../../lib/useHashPayStreamSessionSplash'
import { HashPayStreamMark } from '../HashPayStreamMark'

const assurances = [
  'Your agreements are private to this account',
  'No wallet connection is required',
  'Lifecycle updates come from signed events',
]

export function AgreementSignInLanding({ splashState }: { splashState: HashPayStreamSplashState }) {
  const splashActive = splashState !== 'idle'
  const assembled = splashState === 'assembling' || splashState === 'launching'
  const markVisible = splashState !== 'entering'
  const launching = splashState === 'launching'

  return (
    <section className="relative flex min-h-[calc(100dvh-8rem)] w-full max-w-5xl items-center overflow-hidden py-10 sm:py-14">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[44%] z-0 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/[0.08] blur-3xl dark:bg-blue-500/[0.10]" />

      <div className={`relative z-10 grid w-full items-center gap-10 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none lg:grid-cols-[1.08fr_.92fr] lg:gap-16 ${splashActive && !launching ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Arc agreements
          </div>
          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-gray-950 dark:text-white sm:text-5xl lg:text-6xl">
            Your work and payment, in one clear place.
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-sm font-medium leading-7 text-gray-500 dark:text-gray-400 lg:mx-0 sm:text-base">
            Create protected USDC agreements, submit completed work, and follow every payer-approved release.
          </p>
          <div className="mx-auto mt-7 grid max-w-lg gap-3 text-left lg:mx-0">
            {assurances.map(item => (
              <div key={item} className="flex items-center gap-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md rounded-[2rem] border border-gray-200 bg-white p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-[#18181b] sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
              <HashPayStreamMark className="h-7 w-7" />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.025em] text-gray-950 dark:text-white">
                HashPay<span className="text-blue-500">Stream</span>
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400">Agreement workspace</p>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Secure access</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Sign in to continue.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Use the email connected to your HashPayStream agreements.</p>
          </div>

          <AuthButton
            debugLabel="hashpaystream-agreements"
            className="group relative mt-7 flex min-h-14 w-full items-center justify-center rounded-2xl bg-gray-950 px-16 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-black active:translate-y-0 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
          >
            <Mail className="absolute left-5 h-4 w-4" />
            <span>Continue with email</span>
            <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 transition-transform group-hover:translate-x-0.5 dark:bg-black/[0.06]">
              <ArrowRight className="h-4 w-4" />
            </span>
          </AuthButton>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-medium text-gray-400">
            <LockKeyhole className="h-3.5 w-3.5" />
            Email identity by Privy
          </div>
        </div>
      </div>

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
