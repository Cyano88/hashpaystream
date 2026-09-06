import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

const SPLASH_SESSION_KEY = 'hashpaystream_signin_splash_shown_v2'
const MOBILE_SPLASH_QUERY = '(max-width: 767px)'

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
    return !nativeRuntime && (alreadyShown || isPageReload() || reduceMotion || !mobileViewport) ? 'idle' : 'entering'
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
    const timer = window.setTimeout(() => setState('holding'), 1_120)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'holding' || !canLaunch) return
    setState('launching')
  }, [canLaunch, state])

  useEffect(() => {
    if (state !== 'launching') return
    const timer = window.setTimeout(() => setState('idle'), 320)
    return () => window.clearTimeout(timer)
  }, [state])

  return state
}
