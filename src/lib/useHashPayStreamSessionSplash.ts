import { useEffect, useRef, useState } from 'react'

const SPLASH_SESSION_KEY = 'hashpaystream_signin_splash_shown_v2'
const MOBILE_SPLASH_QUERY = '(max-width: 767px)'

export type HashPayStreamSplashState = 'idle' | 'entering' | 'mark' | 'assembling' | 'launching'

function isPageReload() {
  const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return navigation?.type === 'reload'
}

function initialState(enabled: boolean): HashPayStreamSplashState {
  if (!enabled) return 'idle'
  try {
    const alreadyShown = window.sessionStorage.getItem(SPLASH_SESSION_KEY) === 'true'
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobileViewport = window.matchMedia(MOBILE_SPLASH_QUERY).matches
    return alreadyShown || isPageReload() || reduceMotion || !mobileViewport ? 'idle' : 'entering'
  } catch {
    return 'idle'
  }
}

export function useHashPayStreamSessionSplash(enabled: boolean) {
  const [state, setState] = useState<HashPayStreamSplashState>(() => initialState(enabled))
  const previousEnabled = useRef(enabled)

  useEffect(() => {
    if (enabled && !previousEnabled.current) setState(initialState(true))
    if (!enabled) setState('idle')
    previousEnabled.current = enabled
  }, [enabled])

  useEffect(() => {
    if (state !== 'entering') return
    try {
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, 'true')
    } catch {
      // The animation can still complete when storage is unavailable.
    }
    const timer = window.setTimeout(() => setState('mark'), 120)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'mark') return
    const timer = window.setTimeout(() => setState('assembling'), 520)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'assembling') return
    const timer = window.setTimeout(() => setState('launching'), 1_120)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'launching') return
    const timer = window.setTimeout(() => setState('idle'), 820)
    return () => window.clearTimeout(timer)
  }, [state])

  return state
}
