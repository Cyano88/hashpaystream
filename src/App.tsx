import { useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { StreamPayLayout } from './components/StreamPayLayout'
import AgreementDashboard from './components/agreements/AgreementDashboard'
import FixedAgreementForm from './components/agreements/FixedAgreementForm'
import StreamPayLanding from './components/StreamPayLanding'
import StreamPayDocs from './components/StreamPayDocs'
import StreamPayHome from './components/StreamPayHome'
import StreamPayActivity from './components/StreamPayActivity'
import StreamPayAccount from './components/StreamPayAccount'
import StreamPayLegal from './components/StreamPayLegal'
import StreamPayAgentDocs from './components/StreamPayAgentDocs'
import { BrowserRouter, Navigate, useLocation } from './lib/router'

const AUTH_DECISION_ROUTES = new Set(['/', '/home', '/agreements', '/agreements/new', '/activity', '/account'])

function StreamPayRoute() {
  const { pathname } = useLocation()
  const { ready } = usePrivy()
  const route = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  let content

  if (!ready && AUTH_DECISION_ROUTES.has(route)) {
    return <div className={'min-h-screen w-full bg-gray-50 dark:bg-[#111113]'} aria-busy={true} aria-label={'Loading HashPayStream'} />
  }

  if (route === '/') content = <StreamPayLanding />
  else if (route === '/home') content = <StreamPayHome />
  else if (route === '/agreements') content = <AgreementDashboard />
  else if (route === '/agreements/new') content = <FixedAgreementForm />
  else if (route === '/activity') content = <StreamPayActivity />
  else if (route === '/account') content = <StreamPayAccount />
  else if (route === '/docs') content = <StreamPayDocs />
  else if (route === '/docs/agents') content = <StreamPayAgentDocs />
  else if (route === '/terms') content = <StreamPayLegal page="terms" />
  else if (route === '/privacy') content = <StreamPayLegal page="privacy" />
  else content = <Navigate to="/" replace />

  return <StreamPayLayout>{content}</StreamPayLayout>
}

export default function App() {
  useEffect(() => { document.title = 'HashPayStream' }, [])

  return (
    <BrowserRouter>
      <StreamPayRoute />
    </BrowserRouter>
  )
}
