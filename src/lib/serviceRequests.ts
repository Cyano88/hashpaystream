import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const API = '/api/hashpaystream/v1/service-requests'
export type ServiceRequestTerms = {
  version: number; title: string; description: string; amount: string; amountUsdcUnits: string
  durationSeconds: number; cancellationWindowSeconds: number; upfrontRequested: boolean; upfrontReason?: string
  proposedBy: 'customer' | 'provider'; createdAt: string
}
export type ServiceRequestEvent = { id: string; type: string; actor: 'customer' | 'provider'; createdAt: string; version: number }
export type ServiceRequest = {
  id: string; role: 'customer' | 'provider'; direction: 'sent' | 'received'; counterparty: string
  status: 'sent' | 'countered' | 'provider_accepted' | 'awaiting_funding' | 'funded' | 'expired' | 'refunded' | 'declined' | 'cancelled'
  activeVersion: number; terms: ServiceRequestTerms[]; events: ServiceRequestEvent[]
  agreementId: string; payerReviewPath: string; createdAt: string; updatedAt: string
}

export function useServiceRequests() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useCallback(async (payload?: Record<string, unknown>, idempotencyKey?: string) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to manage requests.')
    const response = await fetch(API, { method: payload ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    const body = await response.json().catch(() => ({})) as Record<string, unknown> & { request?: ServiceRequest; requests?: ServiceRequest[]; error?: string }
    if (!response.ok) throw new Error(body.error || 'Requests could not be loaded.')
    return body
  }, [getAccessToken])
  const refresh = useCallback(async (quiet = false) => {
    if (!authenticated) { setLoading(false); return }
    if (!quiet) setLoading(true)
    try { const body = await request(); setRequests(body.requests ?? []); setError('') }
    catch (reason) { if (!quiet) setError(reason instanceof Error ? reason.message : 'Requests could not be loaded.') }
    finally { if (!quiet) setLoading(false) }
  }, [authenticated, request])
  useEffect(() => { if (!ready) return; void refresh(); if (!authenticated) return; const timer = window.setInterval(() => void refresh(true), 15_000); return () => window.clearInterval(timer) }, [authenticated, ready, refresh])
  const act = useCallback(async (payload: Record<string, unknown>, idempotencyKey?: string) => { const body = await request(payload, idempotencyKey); await refresh(true); return body.request }, [refresh, request])
  const payer = useCallback(async <T,>(payload: Record<string, unknown>) => await request(payload) as T, [request])
  return { requests, loading, error, refresh, act, payer }
}
