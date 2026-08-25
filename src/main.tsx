import React from 'react'
import ReactDOM from 'react-dom/client'
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import './index.css'
import App from './App'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import { upfrontTreasuryEnabled, upfrontXLayerChain } from './lib/upfrontChains'
import { arcTestnet } from './lib/arcWallet'

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
    ...(upfrontTreasuryEnabled ? {
      defaultChain: upfrontXLayerChain,
      supportedChains: [arcTestnet, upfrontXLayerChain],
    } : { defaultChain: arcTestnet, supportedChains: [arcTestnet] }),
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
  return <PrivyProvider appId={appId} config={config}><App /></PrivyProvider>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><Providers /></ThemeProvider></React.StrictMode>,
)
