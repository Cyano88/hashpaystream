import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { CheckIcon, ClipboardDocumentCheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { LoadingRing } from '../ui/LoadingRing'

const API = '/api/hashpaystream/v1/upfront/reviews'
type Item = {
  requestId: string; title: string; description: string; requestedAdvanceBps: number; maximumAdvanceBps: number
  confidence: number; deliveryClarityScore: number; reasonCodes: string[]
  review?: { status: 'pending' | 'approved' | 'declined' }
}
const reason = (code: string) => ({
  DELIVERY_TERMS_NEED_CLARITY: 'Delivery terms need more detail.',
  POLICY_LOW_DELIVERY_CLARITY: 'Delivery clarity is below automatic approval policy.',
  NO_PROVIDER_HISTORY: 'No completed-work history is available yet.',
  LIMITED_EVIDENCE: 'Only limited account evidence is available.',
  ADVANCE_ABOVE_EVIDENCE_CAP: 'Requested advance exceeds the evidence-based limit.',
  POLICY_ADVANCE_ABOVE_CAP: 'Requested advance exceeds the policy limit.',
}[code] || code.replaceAll('_', ' ').toLowerCase())

export default function UpfrontReviewPanel() {
  const { getAccessToken } = usePrivy()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState('')
  const [error, setError] = useState('')
  const token = useCallback(async () => {
    const value = await getAccessToken()
    if (!value) throw new Error('Sign in again to review early-pay requests.')
    return value
  }, [getAccessToken])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API}?review=1`, { cache: 'no-store', headers: { authorization: `Bearer ${await token()}` } })
      const body = await response.json().catch(() => ({})) as { reviews?: Item[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Early-pay reviews could not be loaded.')
      setItems(body.reviews ?? []); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Early-pay reviews could not be loaded.') }
    finally { setLoading(false) }
  }, [token])
  useEffect(() => { void load() }, [load])
  async function decide(requestId: string, action: 'approve' | 'decline') {
    setReviewing(requestId); setError('')
    try {
      const response = await fetch(API, { method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, requestId }) })
      const body = await response.json().catch(() => ({})) as { assessment?: Item; error?: string }
      if (!response.ok || !body.assessment) throw new Error(body.error || 'The decision could not be saved.')
      setItems(current => current.map(item => item.requestId === requestId ? body.assessment! : item))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The decision could not be saved.') }
    finally { setReviewing('') }
  }
  const pending = items.filter(item => item.review?.status === 'pending')
  return <section id="upfront-reviews" className="mt-5 rounded-2xl border border-gray-200 p-5 dark:border-white/10">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white"><ClipboardDocumentCheckIcon className="h-4 w-4 text-blue-500" /> Early-pay reviews</h2>
    <p className="mt-1 text-[11px] leading-5 text-gray-500">Review delivery clarity. Hard safety blocks and evidence limits cannot be overridden.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
    {loading && !items.length && <div className="flex min-h-32 items-center justify-center"><LoadingRing className="h-4 w-4 text-gray-300" label="Loading early-pay reviews" /></div>}
    {!loading && !error && !pending.length && <div className="mt-4 rounded-2xl border border-dashed border-gray-200 py-9 text-center text-xs font-semibold text-gray-500 dark:border-white/10">No reviews need action</div>}
    <div className="mt-4 space-y-3">{pending.map(item => <article key={item.requestId} className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.035]"><div className="flex flex-col gap-4 sm:flex-row sm:justify-between"><div className="min-w-0"><h3 className="text-xs font-bold text-gray-950 dark:text-white">{item.title}</h3><p className="mt-1 text-[11px] leading-5 text-gray-500">{item.description}</p><p className="mt-2 text-[10px] text-gray-500">Requested {item.requestedAdvanceBps / 100}% / Limit {item.maximumAdvanceBps / 100}% / Confidence {item.confidence}% / Clarity {item.deliveryClarityScore}%</p><ul className="mt-2 space-y-1 text-[10px] leading-5 text-gray-500">{item.reasonCodes.map(code => <li key={code}>{reason(code)}</li>)}</ul></div><div className="flex shrink-0 gap-2"><button type="button" disabled={reviewing === item.requestId} onClick={() => void decide(item.requestId, 'decline')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-[11px] font-bold text-gray-600 disabled:opacity-40"><XMarkIcon className="h-3.5 w-3.5" /> Decline</button><button type="button" disabled={reviewing === item.requestId} onClick={() => void decide(item.requestId, 'approve')} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gray-950 px-3 text-[11px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"><CheckIcon className="h-3.5 w-3.5" /> Approve</button></div></div></article>)}</div>
    <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2.5 text-[10px] leading-5 text-blue-700">Approval requests a fresh signed offer at ZeroScout's limit. It cannot bypass a hard block, insufficient evidence, or minimum confidence.</p>
  </section>
}
