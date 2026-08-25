import { useEffect, useState, type FormEvent } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, BanknotesIcon, CheckBadgeIcon } from '@heroicons/react/24/outline'
import { isAddress } from 'viem'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { LoadingRing } from './ui/LoadingRing'
import { StreamSelect } from './ui/StreamSelect'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import FixedAgreementForm from './agreements/FixedAgreementForm'

type Assessment = {
  intelligence: { confidence: number; evidenceGrade: string; summary: string }
  decision: { decision: 'APPROVE' | 'ESCALATE' | 'BLOCK'; maximumAdvanceBps: number; onchainOffer?: { message: { protectedAmount: string } } }
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
const AGREEMENTS_API = '/api/hashpaystream/v1/human/upfront/agreements'
const UPFRONT_ARC_ROUTER = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS || '0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE')
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-950 outline-none transition focus:border-gray-500 dark:border-white/10 dark:bg-[#111113] dark:text-white'

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
  const [providerPayoutAddress, setProviderPayoutAddress] = useState('')
  const [requestedAdvanceBps, setRequestedAdvanceBps] = useState(3000)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [requestKey, setRequestKey] = useState(idempotencyKey)
  const [agreements, setAgreements] = useState<UpfrontAgreement[]>([])
  const [agreementId, setAgreementId] = useState('')
  const [loading, setLoading] = useState(true)
  const homeTo = useStreamPayPath('/home')
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
        if (!cancelled) { setAgreements(eligible); setAgreementId(eligible[0]?.id || '') }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Funded agreements could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken, ready])

  function changeDraft(update: () => void) {
    update(); setAssessment(null); setRequestKey(idempotencyKey())
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || !selected) { setError('Choose an agreement and enter a valid X Layer payout address.'); return }
    setSubmitting(true); setError(''); setAssessment(null)
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The assessment could not be completed.'); setRequestKey(idempotencyKey())
    } finally { setSubmitting(false) }
  }

  if (!ready || loading) return <StreamPayLoadingState active="agreements" />
  if (!authenticated) return null
  if (!agreements.length && !error) return <FixedAgreementForm mode="early" />

  return <section className="w-full max-w-md py-5 sm:py-8">
    <Link to={homeTo} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm dark:bg-white/[0.06] dark:text-white" aria-label="Back home"><ArrowLeftIcon className="h-4 w-4" /></Link>
    <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white">Early pay</h1>
    <form onSubmit={submit} className="mt-5 space-y-5 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">Funded agreement</span><StreamSelect label="Funded agreement" value={agreementId} onChange={value => changeDraft(() => setAgreementId(value))} options={agreements.map(item => ({ value: item.id, label: `${item.title || item.id} · ${decimalUsdc(item.chain?.amountUsdcUnits)} USDC` }))} /></label>
      {selected && <div className="rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-white/[0.04]"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{selected.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">{selected.description}</p></div>}
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">Advance amount</span><StreamSelect label="Advance percentage" value={String(requestedAdvanceBps)} onChange={value => changeDraft(() => setRequestedAdvanceBps(Number(value)))} options={[20, 30, 40, 50].map(percent => ({ value: String(percent * 100), label: `${percent}% of protected amount` }))} /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">X Layer payout address</span><input value={providerPayoutAddress} onChange={event => changeDraft(() => setProviderPayoutAddress(event.target.value.trim()))} placeholder="0x…" autoComplete="off" spellCheck={false} className={inputClass} /><span className="mt-2 block text-[11px] text-gray-400">Your approved advance is sent to this address.</span></label>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">{error}</p>}
      <button disabled={!valid || submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950">{submitting ? <LoadingRing className="h-4 w-4" label="Checking agreement" /> : <BanknotesIcon className="h-4 w-4" />}{submitting ? 'Checking' : 'Check early pay'}</button>
    </form>
    {assessment && <div className="mt-4 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><div className="flex items-center gap-2"><CheckBadgeIcon className="h-5 w-5 text-blue-600" /><p className="text-sm font-bold text-gray-950 dark:text-white">{assessment.decision.decision}</p></div><div className="mt-4 grid grid-cols-3 gap-2"><Result label="Evidence" value={assessment.intelligence.evidenceGrade} /><Result label="Confidence" value={`${assessment.intelligence.confidence}%`} /><Result label="Limit" value={`${assessment.decision.maximumAdvanceBps / 100}%`} /></div><p className="mt-4 text-xs leading-5 text-gray-500 dark:text-gray-400">{assessment.intelligence.summary}</p></div>}
  </section>
}

function Result({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]"><p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 truncate text-xs font-semibold capitalize text-gray-950 dark:text-white">{value}</p></div>
}
