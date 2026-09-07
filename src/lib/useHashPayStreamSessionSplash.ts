import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

const SPLASH_SESSION_KEY = 'hashpaystream_signin_splash_shown_v2'
const MOBILE_SPLASH_QUERY = '(max-width: 767px)'
export const SPLASH_TIMING = { entering: 100, mark: 250, assembling: 850, reading: 450, exit: 0 } as const

export type HashPayStreamSplashState = 'idle' | 'entering' | 'mark' | 'assembling' | 'holding' | 'launching'

function isPageReload() {
  const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return navigation?.type === 'reload'
}

function initialState(enabled: boolean): HashPayStreamSplashState {
  if (!enabled) return 'idle'
  try {
    const nativeRuntime = Capacitor.isNativePlatform()
    const alreadyShown = window.sessionStorage.getItem(SPLASH_SESSION_KEY) === 'true'
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobileViewport = window.matchMedia(MOBILE_SPLASH_QUERY).matches
    return !nativeRuntime && (alreadyShown || isPageReload() || reduceMotion || !mobileViewport) ? 'idle' : reduceMotion ? 'holding' : 'entering'
  } catch {
    return 'idle'
  }
}

export function useHashPayStreamSessionSplash(enabled: boolean, canLaunch = true) {
  const [state, setState] = useState<HashPayStreamSplashState>(() => initialState(enabled))

  // The launch animation belongs to this mount, not to route changes.
  useEffect(() => {
    if (!enabled) setState('idle')
  }, [enabled])

  useEffect(() => {
    if (state !== 'entering') return
    try {
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, 'true')
    } catch {
      // The animation can still complete when storage is unavailable.
    }
    const timer = window.setTimeout(() => setState('mark'), SPLASH_TIMING.entering)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'mark') return
    const timer = window.setTimeout(() => setState('assembling'), SPLASH_TIMING.mark)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'assembling') return
    const timer = window.setTimeout(() => setState('holding'), SPLASH_TIMING.assembling)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'holding' || !canLaunch) return
    const timer = window.setTimeout(() => setState('launching'), SPLASH_TIMING.reading)
    return () => window.clearTimeout(timer)
  }, [canLaunch, state])

  useEffect(() => {
    if (state !== 'launching') return
    const timer = window.setTimeout(() => setState('idle'), SPLASH_TIMING.exit)
    return () => window.clearTimeout(timer)
  }, [state])

  return state
}
