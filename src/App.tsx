import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { StreamPayLayout } from './components/StreamPayLayout'
import AgreementDashboard from './components/agreements/AgreementDashboard'
import FixedAgreementForm from './components/agreements/FixedAgreementForm'
import StreamPayLanding from './components/StreamPayLanding'
import StreamPayDocsHome from './components/docs/StreamPayDocsHome'
import StreamPayArcAgreementDocs from './components/docs/StreamPayArcAgreementDocs'
import StreamPayCircleMarketplaceDocs from './components/docs/StreamPayCircleMarketplaceDocs'
import StreamPayHome from './components/StreamPayHome'
import StreamPayActivity from './components/StreamPayActivity'
import StreamPayNotifications from './components/StreamPayNotifications'
import StreamPayRequests from './components/StreamPayRequests'
import StreamPayAccount from './components/StreamPayAccount'
import StreamPayLegal from './components/StreamPayLegal'
import StreamPayAgentDocsPage from './components/docs/StreamPayAgentDocsPage'
import StreamPayAnalytics from './components/admin/StreamPayAnalytics'
import StreamPayOperations from './components/admin/StreamPayOperations'
import StreamPayStats from './components/StreamPayStats'
import StreamPayUpfront from './components/StreamPayUpfront'
import StreamPayFunding from './components/StreamPayFunding'
import StreamPaySend from './components/StreamPaySend'
import StreamPayReceive from './components/StreamPayReceive'
import { HashPayStreamSessionSplash } from './components/HashPayStreamSessionSplash'
import { BrowserRouter, Navigate, useLocation } from './lib/router'
import { useHashPayStreamSessionSplash } from './lib/useHashPayStreamSessionSplash'
import { LoadingRing } from './components/ui/LoadingRing'
import { CircleWalletGate } from './components/CircleWalletGate'

const AUTH_DECISION_ROUTES = new Set(['/', '/home', '/agreements', '/agreements/new', '/upfront', '/funding', '/send', '/receive', '/activity', '/notifications', '/requests', '/account', '/operations', '/admin/analytics'])
const CIRCLE_ROUTES = new Set(['/home', '/agreements', '/agreements/new', '/upfront', '/funding', '/send', '/receive', '/activity', '/notifications', '/requests', '/account'])
const SESSION_READY_TIMEOUT_MS = 12_000

function SessionLoadingSurface({ sessionDelayed, onRetry }: { sessionDelayed: boolean; onRetry: () => void }) {
  return (
    <div className={'flex min-h-screen w-full items-center justify-center bg-gray-50 dark:bg-[#111113]'} aria-busy={true} aria-label={'Loading HashPayStream'}>
      {sessionDelayed ? (
        <div className={'mx-auto max-w-xs px-6 text-center'} role={'status'} aria-live={'polite'}>
          <p className={'text-sm font-semibold text-gray-900 dark:text-white'}>Taking longer than expected</p>
          <p className={'mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400'}>Check your connection and try again.</p>
          <button type={'button'} onClick={onRetry} className={'mt-5 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:focus:ring-offset-[#111113]'}>
            Retry
          </button>
        </div>
      ) : (
        <LoadingRing className="h-4 w-4 text-gray-300 dark:text-gray-600" />
      )}
    </div>
  )
}

function StreamPayRoute() {
  const { pathname } = useLocation()
  const { ready, authenticated } = usePrivy()
  const route = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const authDecisionRoute = AUTH_DECISION_ROUTES.has(route)
  const splashState = useHashPayStreamSessionSplash(authDecisionRoute, ready)
  const [sessionDelayed, setSessionDelayed] = useState(false)
  let content

  useEffect(() => {
    setSessionDelayed(false)
    if (ready || !authDecisionRoute) return
    const timer = window.setTimeout(() => setSessionDelayed(true), SESSION_READY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [authDecisionRoute, ready])

  const retrySession = () => window.location.reload()

  if (splashState !== 'idle') {
    return (
      <>
        <SessionLoadingSurface sessionDelayed={false} onRetry={retrySession} />
        <HashPayStreamSessionSplash splashState={splashState} sessionDelayed={sessionDelayed} onRetry={retrySession} />
      </>
    )
  }

  if (!ready && authDecisionRoute) {
    return <SessionLoadingSurface sessionDelayed={sessionDelayed} onRetry={retrySession} />
  }

  if (route === '/') content = <StreamPayLanding />
  else if (route === '/home') content = <StreamPayHome />
  else if (route === '/agreements') content = <AgreementDashboard />
  else if (route === '/agreements/new') content = <FixedAgreementForm />
  else if (route === '/upfront') content = <StreamPayUpfront />
  else if (route === '/funding') content = <StreamPayFunding />
  else if (route === '/send') content = <StreamPaySend />
  else if (route === '/receive') content = <StreamPayReceive />
  else if (route === '/upfront/funding') content = <Navigate to="/funding" replace />
  else if (route === '/activity') content = <StreamPayActivity />
  else if (route === '/notifications') content = <StreamPayNotifications />
  else if (route === '/requests') content = <StreamPayRequests />
  else if (route === '/account') content = <StreamPayAccount />
  else if (route === '/operations') content = <StreamPayOperations />
  else if (route === '/admin/analytics') content = <StreamPayAnalytics />
  else if (route === '/stats') content = <StreamPayStats />
  else if (route === '/docs') content = <StreamPayDocsHome />
  else if (route === '/docs/architecture') content = <Navigate to="/docs#how-it-works" replace />
  else if (route === '/docs/arc-agreements') content = <StreamPayArcAgreementDocs />
  else if (route === '/docs/circle-marketplace') content = <StreamPayCircleMarketplaceDocs />
  else if (route === '/docs/agents') content = <StreamPayAgentDocsPage />
  else if (route === '/terms') content = <StreamPayLegal page="terms" />
  else if (route === '/privacy') content = <StreamPayLegal page="privacy" />
  else content = <Navigate to="/" replace />

  return <StreamPayLayout>{authenticated && CIRCLE_ROUTES.has(route) ? <CircleWalletGate>{content}</CircleWalletGate> : content}</StreamPayLayout>
}

export default function App() {
  useEffect(() => { document.title = 'HashPayStream' }, [])

  return (
    <BrowserRouter>
      <StreamPayRoute />
    </BrowserRouter>
  )
}
