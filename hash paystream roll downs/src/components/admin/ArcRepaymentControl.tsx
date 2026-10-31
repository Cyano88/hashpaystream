import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { Capacitor } from '@capacitor/core'
import { useCircleWallet } from '../../lib/circleWallet'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout'

type Control = { address: string; owner: string; paused: boolean }
export default function ArcRepaymentControl() {
  const { getAccessToken } = usePrivy()
  const circle = useCircleWallet()
  const [control, setControl] = useState<Control>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const request = useCallback(async (body: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in to manage repayment.')
    const url = `${Capacitor.isNativePlatform() ? 'https://hashpaystream.app' : ''}/api/hashpaystream/v1/circle-wallet`
    const response = await fetchWithTimeout(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Repayment control is unavailable.')
    return result
  }, [getAccessToken])
  const refresh = useCallback(async () => {
    const result = await request({ action: 'router_status' }) as Control
    setControl(result)
    return result
  }, [request])
  useEffect(() => { void refresh().catch(error => setMessage(error.message)) }, [refresh])
  async function change() {
    if (!control || !circle.session) return
    const paused = !control.paused
    setBusy(true)
    setMessage('Confirm the repayment control in Circle.')
    try {
      const prepared = await request({ action: 'set_router_paused', paused, userToken: circle.session.userToken, walletId: circle.session.wallet.id, walletAddress: circle.address })
      if (!prepared.unchanged) {
        if (typeof prepared.challengeId !== 'string') throw new Error('Circle confirmation was not returned.')
        await circle.executeChallenge(prepared.challengeId)
      }
      for (let attempt = 0; attempt < 20; attempt++) {
        const latest = await refresh()
        if (latest.paused === paused) { setMessage(paused ? 'Repayment paused on Arc.' : 'Repayment enabled on Arc.'); return }
        await new Promise(resolve => setTimeout(resolve, 2500))
      }
      setMessage('Confirmation is still pending. Refresh the state before trying again.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Repayment control failed.') }
    finally { setBusy(false) }
  }
  const isOwner = !!control && circle.address.toLowerCase() === control.owner.toLowerCase()
  return <div className="mb-5 rounded-xl bg-gray-50 p-4 dark:bg-white/5">
    <p className="text-sm font-semibold">Arc repayment</p>
    <p className="mt-1 text-xs text-gray-500">{control ? control.paused ? 'Repayment paused' : 'Repayment enabled' : 'Checking repayment state'}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {!circle.session && <button type="button" className="stream-primary-button" onClick={() => void circle.reconnect().catch(error => setMessage(error.message))}>Connect Circle owner</button>}
      <button type="button" disabled={busy || !isOwner} className="rounded-full bg-gray-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950" onClick={() => void change()}>{busy ? 'Confirming' : control?.paused ? 'Enable repayment' : 'Pause repayment'}</button>
      <button type="button" disabled={busy} className="rounded-full border border-gray-200 px-4 py-2 text-xs dark:border-white/10" onClick={() => void refresh().catch(error => setMessage(error.message))}>Refresh repayment</button>
    </div>
    {circle.session && control && !isOwner && <p className="mt-2 text-xs text-gray-500">Connect the router owner Circle wallet to change this setting.</p>}
    <p role="status" className="mt-2 text-xs text-gray-500">{message}</p>
  </div>
}
