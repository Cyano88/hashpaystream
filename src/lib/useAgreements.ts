import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const AGREEMENTS_API = '/api/hashpaystream/v2/agreements'

export type AgreementSummary = {
  id: string
  title?: string
  description?: string
  template?: 'fixed_unlock' | 'progressive_release' | 'milestone'
  amount?: string
  recipient?: string
  durationSeconds?: number
  cancellationWindowSeconds?: number
  status: 'awaiting_start' | 'active' | 'expired' | 'completed' | 'cancelled' | 'refunded'
  chain: null | {
    amountUsdcUnits: string
    releasedUsdcUnits: string
    remainingUsdcUnits: string
  }
  timeline?: Array<{ id: string; event: string; createdAt: string; receivedAt: string }>
  deliveryTimeline?: Array<{ id: string; event: string; createdAt: string }>
  customerRequest?: {
    decision: 'pending' | 'accepted' | 'declined'
    updatedAt: string
  }
  updatedAt: string
}

type AgreementResponse = { ok?: boolean; agreements?: AgreementSummary[]; error?: string }

function safeUnits(value: unknown) {
  const units = String(value ?? '').trim()
  return /^\d+$/.test(units) ? BigInt(units) : 0n
}

export function formatUsdc(units: bigint | string = 0n) {
  try {
    const value = typeof units === 'bigint' ? units : BigInt(units || '0')
    const whole = value / 1_000_000n
    const decimal = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return `${decimal ? `${whole}.${decimal}` : whole} USDC`
  } catch {
    return '0 USDC'
  }
}

export function useAgreements(apiPath = AGREEMENTS_API) {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [agreements, setAgreements] = useState<AgreementSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!authenticated) {
      setLoading(false)
      return
    }
    if (!quiet) setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to view agreements.')
      const response = await fetch(apiPath, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => undefined) as AgreementResponse | undefined
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Agreements could not be loaded.')
      setAgreements(Array.isArray(data.agreements) ? data.agreements : [])
      setError('')
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : 'Agreements could not be loaded.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [apiPath, authenticated, getAccessToken])

  useEffect(() => {
    if (!ready) return
    void load()
    if (!authenticated) return
    const timer = window.setInterval(() => void load(true), 15_000)
    const onVisibility = () => document.visibilityState === 'visible' && void load(true)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [authenticated, load, ready])

  const totals = useMemo(() => agreements.reduce((result, agreement) => {
    if (!agreement.chain) return result
    if (agreement.status === 'active') result.activeProtected += safeUnits(agreement.chain.remainingUsdcUnits)
    if (agreement.status === 'expired') result.refundAvailable += safeUnits(agreement.chain.remainingUsdcUnits)
    result.released += safeUnits(agreement.chain.releasedUsdcUnits)
    return result
  }, { activeProtected: 0n, released: 0n, refundAvailable: 0n }), [agreements])

  return { ready, authenticated, agreements, totals, loading, error, reload: load }
}
