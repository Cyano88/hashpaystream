import type { CSSProperties } from 'react'
import { SPLASH_TIMING, type HashPayStreamSplashState } from '../lib/useHashPayStreamSessionSplash'
import { useThemeSurface } from '../lib/ThemeContext'
import { HashPayStreamMark } from './HashPayStreamMark'
export function HashPayStreamSessionSplash({ splashState, sessionDelayed = false, onRetry }: { splashState: HashPayStreamSplashState; sessionDelayed?: boolean; onRetry: () => void }) {
  useThemeSurface('launch', splashState !== 'idle')
  if (splashState === 'idle') return null
  const wordmarkVisible = ['assembling', 'holding', 'launching'].includes(splashState)
  return <div aria-hidden={!sessionDelayed} aria-busy={true} className="hashpaystream-reference-launch fixed inset-0 z-[200] overflow-hidden bg-black" data-phase={splashState} style={{ transitionDuration: `${SPLASH_TIMING.exit}ms` }}>
    <div className="absolute inset-0 flex items-center justify-center">
      {!wordmarkVisible && <div className="hashpaystream-launch-mark absolute h-[76px] w-[76px]">
        <HashPayStreamMark className="h-full w-full object-contain" title="Hash PayStream" />
      </div>}
      {wordmarkVisible && <div aria-label="Hash PayStream" className="hashpaystream-launch-wordmark flex whitespace-nowrap text-[25px] font-extrabold tracking-[-0.045em] text-white">
        {Array.from('Hash PayStream').map((letter, index) => <span aria-hidden="true" key={index} style={{ animationDelay: `${index * 24}ms`, '--letter-y': `${[0, 9, -12, 7, -8][index % 5]}px`, '--letter-turn': `${[-16, 12, -10, 8, -6][index % 5]}deg`, '--letter-scale': index === 0 ? 1.55 : 0.3, ...(letter === ' ' ? { minWidth: '0.32em', letterSpacing: 0 } : {}) } as CSSProperties}>{letter === ' ' ? '\u00a0' : letter}</span>)}
      </div>}
    </div>
    {sessionDelayed && <div className="absolute inset-x-6 top-[calc(50%+4.5rem)] text-center" role="status" aria-live="polite">
      <p className="text-[13px] font-semibold text-white">Taking longer than expected</p>
      <p className="mt-1.5 text-xs leading-5 text-white/55">Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-white">Retry</button>
    </div>}
  </div>
}
