import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { usePrivy } from '@privy-io/react-auth'
import { StreamPayLayout } from './components/StreamPayLayout'
import StreamPayLanding from './components/StreamPayLanding'
import StreamPayTrade from './components/StreamPayTrade'
import StreamPayLegal from './components/StreamPayLegal'
import { HashPayStreamSessionSplash } from './components/HashPayStreamSessionSplash'
import { BrowserRouter, Navigate, useLocation, useNavigate } from './lib/router'
import { useHashPayStreamSessionSplash } from './lib/useHashPayStreamSessionSplash'
import { useStreamPayPath } from './lib/useStreamPayPath'
import { CircleWalletGate } from './components/CircleWalletGate'
import { useThemeSurface } from './lib/ThemeContext'
import { useCircleWallet } from './lib/circleWallet'

// Every product entry point requires both email authentication and a ready
// Circle session. Public documentation and legal pages remain accessible.
const CIRCLE_ROUTES = new Set(['/trade'])
const AUTH_DECISION_ROUTES = new Set(['/', ...CIRCLE_ROUTES])
const SESSION_READY_TIMEOUT_MS = 12_000

function SessionLoadingSurface({ sessionDelayed, onRetry }: { sessionDelayed: boolean; onRetry: () => void }) {
  useThemeSurface('launch')
  return (
    <div className={'flex min-h-screen w-full items-center justify-center bg-[#06070a]'} aria-busy={true} aria-label={'Loading Trade'}>
      {sessionDelayed ? (
        <div className={'mx-auto max-w-xs px-6 text-center'} role={'status'} aria-live={'polite'}>
          <p className={'text-sm font-semibold text-gray-900 dark:text-white'}>Taking longer than expected</p>
          <p className={'mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400'}>Check your connection and try again.</p>
          <button type={'button'} onClick={onRetry} className={'mt-5 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:focus:ring-offset-[#111113]'}>
            Retry
          </button>
        </div>
      ) : <span className="sr-only" role="status">Loading Trade</span>}
    </div>
  )
}

function StreamPayRoute() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { ready, authenticated } = usePrivy()
  const circleWallet = useCircleWallet()
  const [circleVerificationConfirmed, setCircleVerificationConfirmed] = useState(false)
  const route = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const authDecisionRoute = AUTH_DECISION_ROUTES.has(route)
  const circleRequired = authenticated && CIRCLE_ROUTES.has(route)
  // Keep the launch surface above Circle while an existing secure session is
  // restoring. Reveal Circle only when a fresh OTP is genuinely required.
  const circleResolved = !circleRequired
    || circleWallet.state === 'ready'
    || circleWallet.state === 'error'
    || (circleWallet.state === 'connecting' && circleWallet.stage === 'verifying' && circleVerificationConfirmed)
  const splashState = useHashPayStreamSessionSplash(authDecisionRoute, ready && circleResolved)
  const [sessionDelayed, setSessionDelayed] = useState(false)
  let content

  const composeRequestTo = useStreamPayPath('/requests?compose=1')
  const fundingTo = useStreamPayPath('/funding')
  const adminTo = useStreamPayPath('/admin/analytics#funding-partners')
  const homeTo = useStreamPayPath('/trade')
  const nativeLaunchNormalized = useRef(false)
  useEffect(() => {
    if (circleWallet.state !== 'connecting' || circleWallet.stage !== 'verifying') {
      setCircleVerificationConfirmed(false)
      return
    }
    // A restoring session can briefly report the previous verification stage.
    // Only reveal Circle OTP after that state remains stable long enough to be
    // a genuine user action, keeping relaunches on the neutral app splash.
    const timer = window.setTimeout(() => setCircleVerificationConfirmed(true), 1_200)
    return () => window.clearTimeout(timer)
  }, [circleWallet.stage, circleWallet.state])

  useEffect(() => {
    setSessionDelayed(false)
    if ((ready && circleResolved) || !authDecisionRoute) return
    const timer = window.setTimeout(() => setSessionDelayed(true), SESSION_READY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [authDecisionRoute, circleResolved, ready])

  useEffect(() => {
    if (nativeLaunchNormalized.current || !ready || !authenticated || !Capacitor.isNativePlatform()) return
    nativeLaunchNormalized.current = true
    if (route !== '/trade') navigate(homeTo, { replace: true })
  }, [authenticated, homeTo, navigate, ready, route])

  useEffect(() => {
    if (ready && authenticated && circleWallet.state === 'idle') void circleWallet.reconnect()
  }, [authenticated, circleWallet.reconnect, circleWallet.state, ready])

  const retrySession = () => window.location.reload()

  if (!ready && authDecisionRoute) {
    return <><SessionLoadingSurface sessionDelayed={sessionDelayed} onRetry={retrySession} /><HashPayStreamSessionSplash splashState={splashState} sessionDelayed={sessionDelayed} onRetry={retrySession} /></>
  }

  if (!authenticated && CIRCLE_ROUTES.has(route)) return <Navigate to="/" replace />
  if (route === '/') content = <StreamPayLanding />
  else if (route === '/trade') content = <StreamPayTrade />
  else if (route === '/terms') content = <StreamPayLegal page="terms" />
  else if (route === '/privacy') content = <StreamPayLegal page="privacy" />
  else content = <Navigate to="/" replace />

  const screen = authenticated && CIRCLE_ROUTES.has(route)
    ? <CircleWalletGate><StreamPayLayout>{content}</StreamPayLayout></CircleWalletGate>
    : <StreamPayLayout>{content}</StreamPayLayout>
  return <>{screen}<HashPayStreamSessionSplash splashState={splashState} sessionDelayed={sessionDelayed} onRetry={retrySession} /></>
}

export default function App() {
  useEffect(() => {
    document.title = 'Trade'
  }, [])

  return (
    <BrowserRouter>
      <StreamPayRoute />
    </BrowserRouter>
  )
}
