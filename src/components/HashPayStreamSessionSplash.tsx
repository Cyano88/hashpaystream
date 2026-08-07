import type { HashPayStreamSplashState } from '../lib/useHashPayStreamSessionSplash'
import { HashPayStreamMark } from './HashPayStreamMark'

export function HashPayStreamSessionSplash({
  splashState,
  sessionDelayed = false,
  onRetry,
}: {
  splashState: HashPayStreamSplashState
  sessionDelayed?: boolean
  onRetry: () => void
}) {
  if (splashState === 'idle') return null
  const assembled = splashState === 'assembling' || splashState === 'holding' || splashState === 'launching'
  const markVisible = splashState !== 'entering'
  const launching = splashState === 'launching'

  return (
    <div
      aria-hidden={!sessionDelayed}
      aria-busy={true}
      className={`${sessionDelayed ? 'pointer-events-auto' : 'pointer-events-none'} fixed inset-0 z-[100] bg-[#06070a] transition-opacity duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:hidden md:hidden ${launching ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className={'absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center'}>
        <HashPayStreamMark className={`h-11 w-11 shrink-0 text-white will-change-transform transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${markVisible ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-0'}`} />
        <div className={`overflow-hidden whitespace-nowrap will-change-transform transition-[max-width,margin,opacity,transform] duration-[880ms] ease-[cubic-bezier(0.16,1,0.3,1)] [&>span]:!text-[1.35rem] ${assembled ? 'ml-3 max-w-[11rem] translate-x-0 opacity-100' : 'ml-0 max-w-0 translate-x-3 opacity-0'}`}>
          <span className={'text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl'}>
            HashPay<span className={'text-blue-500'}>Stream</span>
          </span>
        </div>
      </div>
      {sessionDelayed && (
        <div className={'absolute inset-x-6 top-[calc(50%+4.5rem)] text-center'} role={'status'} aria-live={'polite'}>
          <p className={'text-[13px] font-semibold text-white'}>Taking longer than expected</p>
          <p className={'mt-1.5 text-xs leading-5 text-white/55'}>Check your connection and try again.</p>
          <button type={'button'} onClick={onRetry} className={'mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#06070a]'}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
