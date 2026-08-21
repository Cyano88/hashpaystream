import React from 'react'
import ReactDOM from 'react-dom/client'
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
import '@fontsource/inter/latin.css'
import './index.css'
import App from './App'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import { upfrontSmartWalletEnabled, upfrontXLayerChain } from './lib/upfrontChains'

const appId = String(import.meta.env.VITE_PRIVY_APP_ID || '').trim()
const logoUrl = new URL('/brand/hashpaystream-logo.png', window.location.origin).toString()
const termsUrl = new URL('/terms', window.location.origin).toString()
const privacyUrl = new URL('/privacy', window.location.origin).toString()

function Providers() {
  const { theme } = useTheme()
  if (!appId) {
    return <main className="grid min-h-screen place-items-center bg-gray-50 px-4 text-sm font-semibold text-gray-600">VITE_PRIVY_APP_ID is required.</main>
  }
  const config: PrivyClientConfig = {
    loginMethods: ['email'],
    allowOAuthInEmbeddedBrowsers: true,
    embeddedWallets: { ethereum: { createOnLogin: 'off' } },
    externalWallets: { disableAllExternalWallets: true },
    ...(upfrontSmartWalletEnabled ? {
      defaultChain: upfrontXLayerChain,
      supportedChains: [upfrontXLayerChain],
    } : {}),
    appearance: {
      theme: theme === 'dark' ? 'dark' : 'light',
      accentColor: '#2563eb',
      logo: logoUrl,
      landingHeader: 'HashPayStream',
      loginMessage: 'Our team will never ask for your login code.',
      emailDomain: 'HashPayStream',
    },
    legal: {
      termsAndConditionsUrl: termsUrl,
      privacyPolicyUrl: privacyUrl,
    },
  }
  return (
    <PrivyProvider appId={appId} config={config}>
      {upfrontSmartWalletEnabled ? <SmartWalletsProvider><App /></SmartWalletsProvider> : <App />}
    </PrivyProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><Providers /></ThemeProvider></React.StrictMode>,
)
