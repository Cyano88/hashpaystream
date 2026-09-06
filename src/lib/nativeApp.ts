import { App } from '@capacitor/app'
import { Keyboard } from '@capacitor/keyboard'
import { Browser } from '@capacitor/browser'
import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

const HOME_PATH = '/home'

function applySystemBars() {
  const forcedSurface = document.documentElement.dataset.streamSystemSurface
  const dark = forcedSurface === 'dark'
    || (forcedSurface !== 'light' && document.documentElement.classList.contains('dark'))
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  void SystemBars.setStyle({
    bar: SystemBarType.StatusBar,
    style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  })
  void SystemBars.show({ bar: SystemBarType.StatusBar })
  // Legacy fallback for Android 14 and older. Capacitor 8 SystemBars injects
  // --safe-area-inset-* for modern edge-to-edge Android versions.
  void StatusBar.setOverlaysWebView({ overlay: false })
}

function scheduleSystemBars() {
  applySystemBars()
  window.setTimeout(applySystemBars, 120)
  window.setTimeout(applySystemBars, 420)
}

export function initializeNativeApp() {
  if (!Capacitor.isNativePlatform()) return () => {}

  document.documentElement.dataset.streamNative = 'true'
  scheduleSystemBars()
  const showKeyboard = () => { document.documentElement.dataset.streamKeyboard = 'open' }
  const hideKeyboard = () => { delete document.documentElement.dataset.streamKeyboard }
  const keyboardListeners = [
    Keyboard.addListener('keyboardWillShow', showKeyboard),
    Keyboard.addListener('keyboardDidShow', showKeyboard),
    Keyboard.addListener('keyboardDidHide', hideKeyboard),
  ]
  const themeObserver = new MutationObserver(scheduleSystemBars)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-stream-system-surface'],
  })

  const backListener = App.addListener('backButton', ({ canGoBack }) => {
    const route = window.location.pathname.replace(/\/+$/, '') || '/'
    if (canGoBack) {
      window.history.back()
    } else if (route !== HOME_PATH) {
      window.history.replaceState({}, '', HOME_PATH)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } else {
      void App.minimizeApp()
    }
  })

  const linkListener = App.addListener('appUrlOpen', ({ url }) => {
    try {
      const target = new URL(url)
      if (target.protocol === 'hashpaystream:' || target.hostname === 'hashpaystream.app') {
        const next = `${target.pathname || HOME_PATH}${target.search}${target.hash}`
        window.history.pushState(null, '', next)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    } catch {
      // Ignore malformed external intents.
    }
  })

  const stateListener = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) scheduleSystemBars()
  })

  const onViewportChange = () => scheduleSystemBars()
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') scheduleSystemBars()
  }
  window.addEventListener('orientationchange', onViewportChange)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('pageshow', onViewportChange)
  document.addEventListener('visibilitychange', onVisibilityChange)

  const openExternalLink = (event: MouseEvent) => {
    window.setTimeout(scheduleSystemBars, 0)
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
    if (!anchor || anchor.download || !/^https?:$/.test(anchor.protocol)) return
    if (anchor.origin === window.location.origin && anchor.target !== '_blank') return
    event.preventDefault()
    void Browser.open({ url: anchor.href })
  }
  document.addEventListener('click', openExternalLink)

  return () => {
    themeObserver.disconnect()
    hideKeyboard()
    keyboardListeners.forEach(listener => { void listener.then(handle => handle.remove()) })
    delete document.documentElement.dataset.streamNative
    document.removeEventListener('click', openExternalLink)
    void backListener.then(handle => handle.remove())
    window.removeEventListener('orientationchange', onViewportChange)
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('pageshow', onViewportChange)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void linkListener.then(handle => handle.remove())
    void stateListener.then(handle => handle.remove())
  }
}
