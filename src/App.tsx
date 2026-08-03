import { useEffect } from 'react'
import { StreamPayLayout } from './components/StreamPayLayout'
import AgreementDashboard from './components/agreements/AgreementDashboard'
import FixedAgreementForm from './components/agreements/FixedAgreementForm'
import StreamPayLanding from './components/StreamPayLanding'
import StreamPayDocs from './components/StreamPayDocs'
import { BrowserRouter, Navigate, useLocation } from './lib/router'

function StreamPayRoute() {
  const { pathname } = useLocation()
  const route = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const content = route === '/'
    ? <StreamPayLanding />
    : route === '/docs'
      ? <StreamPayDocs />
      : route === '/agreements'
        ? <AgreementDashboard />
        : route === '/agreements/new'
          ? <FixedAgreementForm />
          : <Navigate to="/" replace />

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
