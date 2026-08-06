import { useEffect } from 'react'
import { StreamPayLayout } from './components/StreamPayLayout'
import AgreementDashboard from './components/agreements/AgreementDashboard'
import FixedAgreementForm from './components/agreements/FixedAgreementForm'
import StreamPayLanding from './components/StreamPayLanding'
import StreamPayDocs from './components/StreamPayDocs'
import StreamPayHome from './components/StreamPayHome'
import StreamPayActivity from './components/StreamPayActivity'
import StreamPayAccount from './components/StreamPayAccount'
import { BrowserRouter, Navigate, useLocation } from './lib/router'

function StreamPayRoute() {
  const { pathname } = useLocation()
  const route = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  let content

  if (route === '/') content = <StreamPayLanding />
  else if (route === '/home') content = <StreamPayHome />
  else if (route === '/agreements') content = <AgreementDashboard />
  else if (route === '/agreements/new') content = <FixedAgreementForm />
  else if (route === '/activity') content = <StreamPayActivity />
  else if (route === '/account') content = <StreamPayAccount />
  else if (route === '/docs') content = <StreamPayDocs />
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
