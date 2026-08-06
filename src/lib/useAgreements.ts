import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const AGREEMENTS_API = '/api/hashpaystream/v2/agreements'

export type AgreementSummary = {
  id: string
  title?: string
  description?: string
  template?: 'fixed_unlock' | 'progressive_release' | 'milestone'
  amount?: string
  status: 'awaiting_start' | 'active' | 'expired' | 'completed' | 'cancelled' | 'refunded'
  chain: null | {
    amountUsdcUnits: string
    releasedUsdcUnits: string
    remainingUsdcUnits: string
  }
  timeline?: Array<{ id: string; event: string; createdAt: string; receivedAt: string }>
  deliveryTimeline?: Array<{ id: string; event: string; createdAt: string }>
  updatedAt: string
}

type AgreementResponse = { ok?: boolean; agreements?: AgreementSummary[]; error?: string }

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

export function useAgreements() {
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
      const response = await fetch(AGREEMENTS_API, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => undefined) as AgreementResponse | undefined
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Agreements could not be loaded.')
      setAgreements(data.agreements ?? [])
      setError('')
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : 'Agreements could not be loaded.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [authenticated, getAccessToken])

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
    if (agreement.status === 'active') result.activeProtected += BigInt(agreement.chain.remainingUsdcUnits || '0')
    if (agreement.status === 'expired') result.refundAvailable += BigInt(agreement.chain.remainingUsdcUnits || '0')
    result.released += BigInt(agreement.chain.releasedUsdcUnits || '0')
    return result
  }, { activeProtected: 0n, released: 0n, refundAvailable: 0n }), [agreements])

  return { ready, authenticated, agreements, totals, loading, error, reload: load }
}
