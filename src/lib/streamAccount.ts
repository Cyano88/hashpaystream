import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const API = '/api/hashpaystream/v1/accounts'

export type StreamProfile = { email: string; displayName: string; pocketId: string; walletAddress: string }
export type StreamTransferActivity = {
  id: string; txHash: string; direction: 'sent' | 'received'; counterpartyPocketId?: string
  counterpartyAddress: string; amountUsdcUnits: string; createdAt: string
}

async function body(response: Response) {
  const data = await response.json().catch(() => ({})) as { profile?: StreamProfile; activity?: StreamTransferActivity[]; recipient?: Omit<StreamProfile, 'email'>; error?: string }
  if (!response.ok) throw new Error(data.error || 'HashPayStream account could not be loaded.')
  return data
}

export function useStreamAccount(includeActivity = false) {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [profile, setProfile] = useState<StreamProfile>()
  const [activity, setActivity] = useState<StreamTransferActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const request = useCallback(async (payload?: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    return body(await fetch(`${API}${!payload && includeActivity ? '?view=activity' : ''}`, {
      method: payload ? 'POST' : 'GET', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }))
  }, [getAccessToken, includeActivity])

  const refresh = useCallback(async () => {
    if (!authenticated) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await request()
      setProfile(data.profile)
      setActivity(data.activity ?? [])
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'HashPayStream account could not be loaded.')
    } finally { setLoading(false) }
  }, [authenticated, request])

  useEffect(() => { if (ready) void refresh() }, [ready, refresh])

  const registerWallet = useCallback(async (walletAddress: string, circleUserToken?: string) => {
    const data = await request({ action: 'register_wallet', walletAddress, ...(circleUserToken ? { circleUserToken } : {}) })
    if (data.profile) setProfile(data.profile)
    return data.profile
  }, [request])

  const resolvePocketId = useCallback(async (pocketId: string) => {
    const data = await request({ action: 'resolve_pocket_id', pocketId })
    if (!data.recipient) throw new Error('Pocket ID was not found.')
    return data.recipient
  }, [request])

  const recordTransfer = useCallback(async (txHash: string) => {
    await request({ action: 'record_transfer', txHash })
  }, [request])
  const updatePocketId = useCallback(async (pocketId: string) => {
    const data = await request({ action: 'update_pocket_id', pocketId })
    if (data.profile) setProfile(data.profile)
    return data.profile
  }, [request])

  return { profile, activity, loading, error, refresh, registerWallet, resolvePocketId, recordTransfer, updatePocketId }
}
