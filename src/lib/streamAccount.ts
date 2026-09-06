import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { fetchWithTimeout } from './fetchWithTimeout'

const API = '/api/hashpaystream/v1/accounts'

export type StreamProfile = { email: string; displayName: string; pocketId: string; walletAddress: string }
export type StreamTransferActivity = {
  id: string; txHash: string; direction: 'sent' | 'received'; counterpartyPocketId?: string
  counterpartyAddress: string; amountUsdcUnits: string; createdAt: string
}

const accountCache = new Map<string, { profile?: StreamProfile; activity: StreamTransferActivity[] }>()
async function body(response: Response) {
  const data = await response.json().catch(() => ({})) as { profile?: StreamProfile; activity?: StreamTransferActivity[]; recipient?: Omit<StreamProfile, 'email'>; error?: string }
  if (!response.ok) throw new Error(data.error || 'HashPayStream account could not be loaded.')
  return data
}

export function useStreamAccount(includeActivity = false) {
  const { ready, authenticated, getAccessToken, user } = usePrivy()
  const scope = authenticated && user?.id ? `${user.id}:${includeActivity ? 'activity' : 'profile'}` : ''
  const currentScope = useRef(scope)
  currentScope.current = scope
  useEffect(() => { currentScope.current = scope; return () => { if (currentScope.current === scope) currentScope.current = '' } }, [scope])
  const cached = scope ? accountCache.get(scope) : undefined
  const [resultScope, setResultScope] = useState(scope)
  const [profile, setProfile] = useState<StreamProfile | undefined>(() => cached?.profile)
  const [activity, setActivity] = useState<StreamTransferActivity[]>(() => cached?.activity ?? [])
  const [loading, setLoading] = useState(() => !cached)
  const [error, setError] = useState('')

  const request = useCallback(async (payload?: Record<string, unknown>) => {
    if (!scope || currentScope.current !== scope) throw new Error('Account changed. Try again.')
    const token = await getAccessToken()
    if (currentScope.current !== scope) throw new Error('Account changed. Try again.')
    if (!token) throw new Error('Sign in again to continue.')
    const result = await body(await fetchWithTimeout(`${API}${!payload && includeActivity ? '?view=activity' : ''}`, {
      method: payload ? 'POST' : 'GET', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }))
    if (currentScope.current !== scope) throw new Error('Account changed. Try again.')
    return result
  }, [getAccessToken, includeActivity, scope])

  const refresh = useCallback(async () => {
    if (!scope) { setLoading(false); return }
    if (!accountCache.has(scope)) setLoading(true)
    try {
      const data = await request()
      const next = { profile: data.profile, activity: data.activity ?? [] }
      accountCache.set(scope, next)
      setResultScope(scope)
      setProfile(next.profile)
      setActivity(next.activity)
      setError('')
    } catch (reason) {
      if (currentScope.current !== scope) return
      setError(reason instanceof Error ? reason.message : 'HashPayStream account could not be loaded.')
    } finally { if (currentScope.current === scope) setLoading(false) }
  }, [authenticated, request, scope])

  useEffect(() => { if (ready) void refresh() }, [ready, refresh])

  const registerWallet = useCallback(async (walletAddress: string, circleUserToken?: string) => {
    const data = await request({ action: 'register_wallet', walletAddress, ...(circleUserToken ? { circleUserToken } : {}) })
    if (data.profile) { setResultScope(scope); setProfile(data.profile) }
    return data.profile
  }, [request, scope])

  const resolvePocketId = useCallback(async (pocketId: string) => {
    const data = await request({ action: 'resolve_pocket_id', pocketId })
    if (!data.recipient) throw new Error('Pocket ID was not found.')
    return data.recipient
  }, [request, scope])

  const recordTransfer = useCallback(async (txHash: string) => {
    await request({ action: 'record_transfer', txHash })
  }, [request, scope])
  const updatePocketId = useCallback(async (pocketId: string) => {
    const data = await request({ action: 'update_pocket_id', pocketId })
    if (data.profile) { setResultScope(scope); setProfile(data.profile) }
    return data.profile
  }, [request, scope])

  return { profile: scope && resultScope === scope ? profile : cached?.profile, activity: scope && resultScope === scope ? activity : cached?.activity ?? [], loading: resultScope === scope ? loading : Boolean(scope && !cached), error: resultScope === scope ? error : '', refresh, registerWallet, resolvePocketId, recordTransfer, updatePocketId }
}
