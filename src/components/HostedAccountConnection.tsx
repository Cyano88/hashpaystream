import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { LinkIcon } from '@heroicons/react/24/outline'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'

type Status = { enabled: boolean; connected: boolean; pending?: boolean; connectUrl?: string }
export default function HostedAccountConnection() {
  const { user } = usePrivy()
  return user ? <Connection key={user.id} /> : null
}
function Connection() {
  const { getAccessToken } = usePrivy()
  const [status, setStatus] = useState<Status>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const active = useRef(true), lock = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function request(action?: string, signal?: AbortSignal): Promise<Status> {
    const token = await getAccessToken()
    if (!active.current || !token) throw Error('Sign in again to continue.')
    const response = await fetchWithTimeout('/api/hashpaystream/v1/hosted-account', { method: action ? 'POST' : 'GET', signal,
      headers: { authorization: 'Bearer '+token, ...(action ? { 'content-type': 'application/json' } : {}) },
      ...(action ? { body: JSON.stringify({ action }) } : {}) })
    const data = await response.json().catch(() => { throw Error('Connection unavailable. Try again.') })
    if (!response.ok || data.ok !== true) throw Error(data.error || 'Could not connect your account.')
    if (data.connectUrl && !/^https:\/\/app\.hashpaylink\.com\/wallet\/connect\/wcs_[a-f0-9]{48}#access=[A-Za-z0-9_-]{43}$/.test(data.connectUrl)) throw Error('Invalid connection link.')
    return data
  }
  useEffect(() => {
    const controller = new AbortController()
    void request(undefined, controller.signal).then(data => { if (!controller.signal.aborted) setStatus(data) })
      .catch(() => { /* Keep this optional integration hidden until configured and reachable. */ })
    return () => controller.abort()
  }, [])
  async function run(action: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { const data = await request(action); if (active.current) setStatus(previous => ({ ...previous, ...data, connectUrl: data.connected ? undefined : data.connectUrl || previous?.connectUrl })) }
    catch (e) { if (active.current) setError((e as Error).message) }
    finally { lock.current = false; if (active.current) setBusy(false) }
  }
  if (!status?.enabled) return null
  return <div className="border-t border-gray-100 px-4 py-4 dark:border-white/[0.07]">
    <div className="flex items-center gap-3"><LinkIcon className="h-5 w-5 text-gray-500" /><span className="text-sm font-bold">Hash PayLink account</span></div>
    <p className="mt-2 text-xs text-gray-500">{status.connected ? 'Connected for hosted payments. Payment approval is still required.' : 'Connect once to use Hash PayLink hosted payments. Your current wallets stay available.'}</p>
    {!status.connected && <div className="mt-3 flex flex-wrap gap-3">
      {status.connectUrl ? <a href={status.connectUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-gray-950 px-4 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Open Hash PayLink</a>
        : <button disabled={busy} onClick={() => void run('start')} className="min-h-11 rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Opening...' : 'Connect account'}</button>}
      {(status.pending || status.connectUrl) && <button disabled={busy} onClick={() => void run('complete')} className="min-h-11 text-xs font-bold disabled:opacity-40">Check connection</button>}
      {status.connectUrl && <button disabled={busy} onClick={() => void run('start')} className="min-h-11 text-xs underline">Refresh link</button>}
    </div>}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </div>
}
