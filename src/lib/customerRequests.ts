import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const API = '/api/hashpaystream/v1/requests'
export type CustomerRequest = {
  id: string; title: string; description: string; amountUsdcUnits: string; status: string
  decision: 'to_review' | 'accepted' | 'declined'; createdAt: string; updatedAt: string; payerReviewPath: string; earlyPay: boolean
}

export function useCustomerRequests() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [requests, setRequests] = useState<CustomerRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useCallback(async (payload?: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to view requests.')
    const response = await fetch(API, { method: payload ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    const body = await response.json().catch(() => ({})) as { requests?: CustomerRequest[]; error?: string }
    if (!response.ok) throw new Error(body.error || 'Requests could not be loaded.')
    return body
  }, [getAccessToken])
  const refresh = useCallback(async () => {
    if (!authenticated) { setLoading(false); return }
    setLoading(true)
    try { const body = await request(); setRequests(body.requests ?? []); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Requests could not be loaded.') }
    finally { setLoading(false) }
  }, [authenticated, request])
  useEffect(() => { if (ready) void refresh() }, [ready, refresh])
  const decline = useCallback(async (agreementId: string) => { await request({ action: 'decline', agreementId }); await refresh() }, [refresh, request])
  return { requests, loading, error, refresh, decline }
}
