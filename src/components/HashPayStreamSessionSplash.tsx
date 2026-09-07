import { SPLASH_TIMING, type HashPayStreamSplashState } from '../lib/useHashPayStreamSessionSplash'
import { useThemeSurface } from '../lib/ThemeContext'
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
  useThemeSurface('launch', splashState !== 'idle')

  if (splashState === 'idle') return null
  const assembled = splashState === 'assembling' || splashState === 'holding' || splashState === 'launching'

  return (
    <div
      aria-hidden={!sessionDelayed}
      aria-busy={true}
      className="fixed inset-0 z-[200] overflow-hidden bg-[#06070a]"
    >
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
        <div style={{ transitionDuration: `${SPLASH_TIMING.assembling}ms`, transform: assembled ? 'translate3d(0,0,0)' : 'translate3d(86px,0,0)' }} className="h-11 w-11 shrink-0 will-change-transform transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none">
          <HashPayStreamMark className="h-11 w-11" />
        </div>
        <div style={{ transitionDuration: `${SPLASH_TIMING.assembling}ms` }} className={`ml-3 w-40 whitespace-nowrap will-change-[transform,opacity] transition-[transform,opacity] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${assembled ? 'translate-x-0 opacity-100' : 'translate-x-1 opacity-0'}`}>
          <span className="text-[1.35rem] font-semibold tracking-[-0.045em] text-white">
            HashPay<span className="text-blue-500">Stream</span>
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
