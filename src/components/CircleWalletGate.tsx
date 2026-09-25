import { ARC_WALLET_APP_ID } from '../lib/arcWalletConfig'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { CircleWalletAccessScreen } from '@hashpaylink/sdk/wallet'
import '@hashpaylink/sdk/wallet.css'
import { useCircleWallet } from '../lib/circleWallet'
import { useThemeSurface } from '../lib/ThemeContext'
import { clearPersistedCircleSession } from '../lib/circleSession'

export function CircleWalletGate({ children }: { children: React.ReactNode }) {
  const wallet = useCircleWallet()
  useThemeSurface('auth', wallet.state !== 'ready')
  const { logout, user, getAccessToken } = usePrivy()
  const [project, setProject] = useState<{ projectName: string }>()
  useEffect(() => {
    const abort = new AbortController()
    setProject(undefined)
    void (async () => {
      const token = await getAccessToken()
      if (!token || abort.signal.aborted) return
      const response = await fetchWithTimeout('/api/hashpaystream/v1/hosted-account', { signal: abort.signal, headers: { authorization: 'Bearer ' + token } })
      const data = await response.json()
      if (response.ok && data.ok === true && data.enabled && typeof data.projectName === 'string' && !abort.signal.aborted) setProject({ projectName: data.projectName })
    })().catch(() => { /* Optional bridge branding must not prevent wallet sign-in. */ })
    return () => abort.abort()
  }, [user?.id, getAccessToken])
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (wallet.state === 'idle') void wallet.reconnect()
  }, [wallet.reconnect, wallet.state])
  if (wallet.state === 'ready') return children
  if (wallet.state === 'idle' || (wallet.state === 'connecting' && wallet.stage === 'restoring')) {
    return <main className="stream-auth-surface fixed inset-0" aria-busy="true"><span className="sr-only" role="status">Restoring your wallet session</span></main>
  }
  async function useAnotherEmail() {
    if (leaving) return
    setLeaving(true)
    await clearPersistedCircleSession(window.localStorage, ARC_WALLET_APP_ID, user?.email?.address ?? '')
    try {
      await logout()
    } finally {
      window.location.replace('/')
    }
  }
  return <CircleWalletAccessScreen
    productName="Hash PayStream"
    project={project}
    busy={wallet.state !== 'error'}
    error={wallet.error || ''}
    onRetry={() => void wallet.reconnect()}
    restoring={wallet.stage === 'restoring'}
    onReauthorize={wallet.state === 'error' && wallet.stage === 'restoring' ? () => void wallet.reauthorize() : undefined}
    onUseAnotherEmail={() => void useAnotherEmail()}
    leaving={leaving}
  />
}
