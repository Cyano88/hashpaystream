import { useEffect, useState, type FormEvent } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, BanknotesIcon, CheckBadgeIcon } from '@heroicons/react/24/outline'
import { isAddress } from 'viem'
import { Link, useLocation } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { LoadingRing } from './ui/LoadingRing'
import { StreamSelect } from './ui/StreamSelect'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import { ProviderPayoutWallet } from './ProviderPayoutWallet'
import FundingPartnerPicker from './FundingPartnerPicker'

type Assessment = {
  intelligence: { confidence: number; evidenceGrade: string; deliveryClarityScore: number; summary: string; reasonCodes?: string[] }
  decision: { requestId: string; decision: 'APPROVE' | 'ESCALATE' | 'BLOCK'; maximumAdvanceBps: number; reasonCodes?: string[]; onchainOffer?: { message: { protectedAmount: string; underwritingDeadline: number } } }
}
type Review = { status: 'pending' | 'approved' | 'declined'; submittedAt: string; reviewedAt?: string }
type ReviewAssessment = {
  requestId: string; maximumAdvanceBps: number; decision: Assessment['decision']['decision']
  onchainOffer?: Assessment['decision']['onchainOffer']
  review?: Review
}
type UpfrontAgreement = {
  id: string
  title?: string
  description?: string
  status: string
  template?: string
  recipient?: string
  durationSeconds?: number
  cancellationWindowSeconds?: number
  chain?: null | { amountUsdcUnits?: string }
}

const API = '/api/hashpaystream/v1/upfront/assessments'
const REVIEW_API = '/api/hashpaystream/v1/upfront/reviews'
const AGREEMENTS_API = '/api/hashpaystream/v1/human/upfront/agreements'
const UPFRONT_ARC_ROUTER = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS || '0x0E47e6dD4f86C5Cf1843Dce310b710FaE64c0C16')
function idempotencyKey() {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return `hashpaystream-upfront:${suffix}`
}

function decimalUsdc(units?: string) {
  if (!units || !/^\d+$/.test(units)) return ''
  const padded = units.padStart(7, '0')
  return `${padded.slice(0, -6)}.${padded.slice(-6)}`.replace(/0+$/, '').replace(/\.$/, '')
}

export default function StreamPayUpfront() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const { search } = useLocation()
  const requestedAgreementId = new URLSearchParams(search).get('agreementId') || ''
  const [providerPayoutAddress, setProviderPayoutAddress] = useState('')
  const [requestedAdvanceBps, setRequestedAdvanceBps] = useState(3000)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [review, setReview] = useState<Review>()
  const [reviewing, setReviewing] = useState(false)
  const [requestKey, setRequestKey] = useState(idempotencyKey)
  const [agreements, setAgreements] = useState<UpfrontAgreement[]>([])
  const [agreementId, setAgreementId] = useState('')
  const [loading, setLoading] = useState(true)
  const homeTo = useStreamPayPath('/home')
  const requestsTo = useStreamPayPath('/requests?tab=received')
  const selected = agreements.find(item => item.id === agreementId)
  const amount = decimalUsdc(selected?.chain?.amountUsdcUnits)
  const valid = Boolean(selected && isAddress(providerPayoutAddress) && !/^0x0{40}$/i.test(providerPayoutAddress))

  useEffect(() => {
    if (!ready || !authenticated) { setLoading(false); return }
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Sign in again to continue.')
        const response = await fetch(AGREEMENTS_API, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
        const body = await response.json().catch(() => ({})) as { agreements?: UpfrontAgreement[]; error?: string }
        if (!response.ok) throw new Error(body.error || 'Funded agreements could not be loaded.')
        const eligible = (body.agreements || []).filter(item => item.status === 'active' && item.template === 'fixed_unlock' && item.recipient?.toLowerCase() === UPFRONT_ARC_ROUTER.toLowerCase())
        if (!cancelled) {
          const requestedAgreement = requestedAgreementId ? eligible.find(item => item.id === requestedAgreementId) : undefined
          setAgreements(eligible)
          setAgreementId(requestedAgreement?.id || (requestedAgreementId ? '' : eligible[0]?.id || ''))
          if (requestedAgreementId && !requestedAgreement) setError('This funded agreement is not available for early pay.')
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Funded agreements could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken, ready, requestedAgreementId])

  function changeDraft(update: () => void) {
    update(); setAssessment(null); setReview(undefined); setRequestKey(idempotencyKey())
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || !selected) { setError('Choose an agreement and create your X Layer payout wallet.'); return }
    setSubmitting(true); setError(''); setAssessment(null); setReview(undefined)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to continue.')
      const response = await fetch(API, {
        method: 'POST', cache: 'no-store',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': requestKey },
        body: JSON.stringify({ agreementId: selected.id, template: 'fixed_unlock', title: selected.title, description: selected.description, amount, durationSeconds: selected.durationSeconds, cancellationWindowSeconds: selected.cancellationWindowSeconds, providerPayoutAddress, requestedAdvanceBps }),
      })
      const body = await response.json().catch(() => ({})) as { assessment?: Assessment; error?: string }
      if (!response.ok || !body.assessment) throw new Error(body.error || 'The assessment could not be completed.')
      setAssessment(body.assessment)
      setRequestKey(idempotencyKey())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The assessment could not be completed.'); setRequestKey(idempotencyKey())
    } finally { setSubmitting(false) }
  }

  async function submitReview() {
    if (!assessment?.decision.requestId) return
    setReviewing(true); setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to submit this review.')
      const response = await fetch(REVIEW_API, {
        method: 'POST', cache: 'no-store',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'submit', requestId: assessment.decision.requestId }),
      })
      const body = await response.json().catch(() => ({})) as { assessment?: ReviewAssessment; error?: string }
      if (!response.ok || !body.assessment?.review) throw new Error(body.error || 'The review request could not be submitted.')
      setReview(body.assessment.review)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review request could not be submitted.')
    } finally { setReviewing(false) }
  }

  useEffect(() => {
    if (!assessment?.decision.requestId || review?.status !== 'pending') return
    let cancelled = false
    const poll = async () => {
      try {
        const token = await getAccessToken()
        if (!token) return
        const response = await fetch(`${REVIEW_API}?requestId=${encodeURIComponent(assessment.decision.requestId)}`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
        const body = await response.json().catch(() => ({})) as { assessment?: ReviewAssessment }
        if (!cancelled && response.ok && body.assessment?.review) {
          setReview(body.assessment.review)
          if (body.assessment.decision === 'APPROVE') {
            setAssessment(current => current ? { ...current, decision: { ...current.decision, decision: 'APPROVE', maximumAdvanceBps: body.assessment!.maximumAdvanceBps, onchainOffer: body.assessment!.onchainOffer } } : current)
          }
        }
      } catch { /* The next poll can recover a transient read failure. */ }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 10_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [assessment?.decision.requestId, getAccessToken, review?.status])

  if (!ready || loading) return <StreamPayLoadingState active="agreements" />
  if (!authenticated) return null
  if (!agreements.length && !error) return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <Link to={homeTo} className="stream-icon-button" aria-label="Back home"><ArrowLeftIcon className="h-4 w-4" /></Link>
    <div className="flex min-h-[62vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm dark:bg-white/[0.06]"><BanknotesIcon className="h-6 w-6" /></span>
      <h1 className="mt-4 text-lg font-extrabold text-gray-950 dark:text-white">No early-pay request yet</h1>
      <p className="mt-1 max-w-xs text-xs leading-5 text-gray-400">Open a customer request, choose Change terms, and explain why you need early pay.</p>
      <Link to={requestsTo} className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-gray-950 px-6 text-sm font-bold text-white dark:bg-white dark:text-gray-950">Open requests</Link>
    </div>
  </section>

  return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <Link to={homeTo} className="stream-icon-button" aria-label="Back home"><ArrowLeftIcon className="h-4 w-4" /></Link>
    <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white">Early pay</h1>
    <form onSubmit={submit} className="stream-card mt-5 space-y-5 p-5">
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">Funded agreement</span><StreamSelect label="Funded agreement" value={agreementId} onChange={value => changeDraft(() => setAgreementId(value))} options={agreements.map(item => ({ value: item.id, label: `${item.title || item.id} / ${decimalUsdc(item.chain?.amountUsdcUnits)} USDC` }))} /></label>
      {selected && <div className="rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-white/[0.04]"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{selected.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">{selected.description}</p></div>}
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">Advance amount</span><StreamSelect label="Advance percentage" value={String(requestedAdvanceBps)} onChange={value => changeDraft(() => setRequestedAdvanceBps(Number(value)))} options={[20, 30, 40, 50].map(percent => ({ value: String(percent * 100), label: `${percent}% of protected amount` }))} /></label>
      <ProviderPayoutWallet value={providerPayoutAddress} onChange={value => changeDraft(() => setProviderPayoutAddress(value))} />
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">{error}</p>}
      <button disabled={!valid || submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950">{submitting ? <LoadingRing className="h-4 w-4" label="Checking agreement" /> : <BanknotesIcon className="h-4 w-4" />}{submitting ? 'Checking' : 'Check early pay'}</button>
    </form>
    {assessment && <AssessmentResult assessment={assessment} review={review} reviewing={reviewing} onSubmitReview={submitReview} />}
  </section>
}

function reasonLabel(code: string) {
  const labels: Record<string, string> = {
    DELIVERY_TERMS_NEED_CLARITY: 'Delivery terms need more detail.',
    POLICY_LOW_DELIVERY_CLARITY: 'Delivery clarity is below the automatic approval threshold.',
    NO_PROVIDER_HISTORY: 'No completed-work history is available yet.',
    LIMITED_EVIDENCE: 'Only limited account evidence is available.',
    ADVANCE_ABOVE_EVIDENCE_CAP: 'The requested amount is above the evidence-based limit.',
    POLICY_ADVANCE_ABOVE_CAP: 'The requested amount exceeds the policy limit.',
  }
  return labels[code] || ''
}

function AssessmentResult({ assessment, review, reviewing, onSubmitReview }: { assessment: Assessment; review?: Review; reviewing: boolean; onSubmitReview: () => Promise<void> }) {
  const reasons = [...new Set([...(assessment.intelligence.reasonCodes ?? []), ...(assessment.decision.reasonCodes ?? [])].map(reasonLabel).filter(Boolean))]
  const protectedUnits = assessment.decision.onchainOffer?.message.protectedAmount
  const approvedUnits = protectedUnits && /^\d+$/.test(protectedUnits)
    ? (BigInt(protectedUnits) * BigInt(assessment.decision.maximumAdvanceBps) / 10_000n).toString()
    : ''
  const approvedAmount = decimalUsdc(approvedUnits)
  const underwritingDeadline = assessment.decision.onchainOffer?.message.underwritingDeadline
  const expiresAt = Number.isSafeInteger(underwritingDeadline) ? new Date(Number(underwritingDeadline) * 1_000) : undefined
  return <div className="stream-card mt-4 p-5">
    <div className="flex items-center gap-2"><CheckBadgeIcon className="h-5 w-5 text-blue-600" /><p className="text-sm font-bold text-gray-950 dark:text-white">{assessment.decision.decision}</p></div>
    <div className="mt-4 grid grid-cols-2 gap-2"><Result label="Evidence" value={assessment.intelligence.evidenceGrade} /><Result label="Confidence" value={`${assessment.intelligence.confidence}%`} /><Result label="Clarity" value={`${assessment.intelligence.deliveryClarityScore}%`} /><Result label="Limit" value={`${assessment.decision.maximumAdvanceBps / 100}%`} /></div>
    <p className="mt-4 text-xs leading-5 text-gray-500 dark:text-gray-400">{assessment.intelligence.summary}</p>
    {reasons.length > 0 && <ul className="mt-3 space-y-1.5">{reasons.map(reason => <li key={reason} className="flex gap-2 text-[11px] leading-5 text-gray-500"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-300" />{reason}</li>)}</ul>}
    {assessment.decision.decision === 'APPROVE' && approvedAmount && <><div className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"><p className="font-bold">Eligible for up to {approvedAmount} USDC</p>{expiresAt && <p className="mt-1 text-[10px] opacity-75">Choose a partner before {expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}</div><FundingPartnerPicker requestId={assessment.decision.requestId} /></>}
    {assessment.decision.decision === 'ESCALATE' && !review && <button type="button" disabled={reviewing} onClick={() => void onSubmitReview()} className="mt-4 min-h-11 w-full rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{reviewing ? 'Submitting...' : 'Submit for review'}</button>}
    {review?.status === 'pending' && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Review submitted. HashPayStream will update this result after an operator decision.</p>}
    {review?.status === 'declined' && <p className="mt-4 rounded-xl bg-gray-100 px-3 py-2.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">Review declined. Create a new customer request with clearer delivery terms.</p>}
    {review?.status === 'approved' && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">Review approved. A signed offer is now available to approved funding partners.</p>}
  </div>
}

function Result({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 truncate text-xs font-semibold capitalize text-gray-950 dark:text-white">{value}</p></div>
}
