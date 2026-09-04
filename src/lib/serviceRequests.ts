import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { reconcileUpdatedSnapshots } from './stableSnapshots'
import { fetchWithTimeout } from './fetchWithTimeout'

const API = '/api/hashpaystream/v1/service-requests'
export type ServiceRequestTerms = {
  version: number; title: string; description: string; amount: string; amountUsdcUnits: string
  durationSeconds: number; cancellationWindowSeconds: number; upfrontRequested: boolean; upfrontReason?: string
  proposedBy: 'customer' | 'provider'; createdAt: string
}
export type ServiceRequestEvent = { id: string; type: string; actor: 'customer' | 'provider'; createdAt: string; version: number }
export type EarlyPaySettlement = {
  status: 'requested' | 'ready_to_release' | 'received' | 'completed' | 'refunded'
  partnerName: string
  advanceUsdcUnits: string
  providerRemainderUsdcUnits: string
  providerTotalUsdcUnits: string
  funderRepaymentUsdcUnits: string
  funderProfitUsdcUnits: string
  platformFeeUsdcUnits: string
}
export type ServiceRequest = {
  id: string; role: 'customer' | 'provider'; direction: 'sent' | 'received'; counterparty: string
  status: 'sent' | 'countered' | 'provider_accepted' | 'awaiting_funding' | 'funded' | 'expired' | 'completed' | 'refunded' | 'declined' | 'cancelled'
  activeVersion: number; terms: ServiceRequestTerms[]; events: ServiceRequestEvent[]
  agreementId: string; payerReviewPath: string; earlyPaySettlement?: EarlyPaySettlement; createdAt: string; updatedAt: string
}

const serviceRequestCache = new Map<string, ServiceRequest[]>()
export function useServiceRequests() {
  const { ready, authenticated, getAccessToken, user } = usePrivy()
  const scope = authenticated ? user?.id ?? 'pending' : ''
  const cached = scope ? serviceRequestCache.get(scope) : undefined
  const [requests, setRequests] = useState<ServiceRequest[]>(() => cached ?? [])
  const [loading, setLoading] = useState(() => !cached)
  const [error, setError] = useState('')
  const refreshSequence = useRef(0)
  const request = useCallback(async (payload?: Record<string, unknown>, idempotencyKey?: string) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to manage requests.')
    const response = await fetchWithTimeout(API, { method: payload ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    const body = await response.json().catch(() => ({})) as Record<string, unknown> & { request?: ServiceRequest; requests?: ServiceRequest[]; error?: string }
    if (!response.ok) throw new Error(body.error || 'Requests could not be loaded.')
    return body
  }, [getAccessToken])
  const refresh = useCallback(async (quiet = false) => {
    if (!authenticated) { setLoading(false); return }
    const sequence = ++refreshSequence.current
    if (!quiet && !serviceRequestCache.has(scope)) setLoading(true)
    try {
      const body = await request()
      if (sequence !== refreshSequence.current) return
      setRequests(current => {
        const next = reconcileUpdatedSnapshots(current, body.requests ?? [])
        serviceRequestCache.set(scope, next)
        return next
      })
      setError('')
    }
    catch (reason) { if (!quiet && sequence === refreshSequence.current) setError(reason instanceof Error ? reason.message : 'Requests could not be loaded.') }
    finally { if (!quiet && sequence === refreshSequence.current) setLoading(false) }
  }, [authenticated, request, scope])
  useEffect(() => { if (!ready) return; void refresh(); if (!authenticated) return; const timer = window.setInterval(() => void refresh(true), 15_000); return () => window.clearInterval(timer) }, [authenticated, ready, refresh])
  const act = useCallback(async (payload: Record<string, unknown>, idempotencyKey?: string) => { const body = await request(payload, idempotencyKey); await refresh(true); return body.request }, [refresh, request])
  const payer = useCallback(async <T,>(payload: Record<string, unknown>) => await request(payload) as T, [request])
  return { requests, loading, error, refresh, act, payer }
}
