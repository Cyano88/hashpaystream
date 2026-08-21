import { useEffect, useState, type FormEvent } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowPathIcon, BanknotesIcon, CheckBadgeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { isAddress } from 'viem'
import { AuthButton } from '../lib/AuthButton'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

type Assessment = {
  intelligence: {
    recommendation: string
    confidence: number
    evidenceGrade: string
    deliveryClarityScore: number
    reasonCodes: string[]
    summary: string
  }
  decision: {
    decision: 'APPROVE' | 'ESCALATE' | 'BLOCK'
    maximumAdvanceBps: number
    humanReviewRequired: boolean
    reasonCodes: string[]
    expiresAt: string
    onchainOffer?: {
      signer: string
      domain: { chainId: number; verifyingContract: string }
      message: { protectedAmount: string }
    }
  }
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
const AGREEMENTS_API = '/api/hashpaystream/v1/upfront/agreements'
const UPFRONT_ARC_ROUTER = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS ?? '0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE')
const inputClass = 'mt-2 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white'

function idempotencyKey() {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return `hashpaystream-upfront:${suffix}`
}

function validUsdc(value: string) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) return false
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')) > 0n
}

function usdc(units: string) {
  const padded = units.padStart(7, '0')
  const rendered = `${padded.slice(0, -6)}.${padded.slice(-6)}`.replace(/0+$/, '').replace(/\.$/, '')
  return `${rendered} USDC`
}
function decimalUsdc(units?: string) {
  if (!units || !/^\d+$/.test(units)) return ''
  const padded = units.padStart(7, '0')
  return `${padded.slice(0, -6)}.${padded.slice(-6)}`.replace(/0+$/, '').replace(/\.$/, '')
}

export default function StreamPayUpfront() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(86400)
  const [cancellationWindowSeconds, setCancellationWindowSeconds] = useState(900)
  const [providerPayoutAddress, setProviderPayoutAddress] = useState('')
  const [requestedAdvanceBps, setRequestedAdvanceBps] = useState(3000)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [requestKey, setRequestKey] = useState(idempotencyKey)
  const [agreements, setAgreements] = useState<UpfrontAgreement[]>([])
  const [agreementId, setAgreementId] = useState('')
  const [loadingAgreements, setLoadingAgreements] = useState(true)
  const fundingDeskTo = useStreamPayPath('/upfront/funding')
  const selectedAgreement = agreements.find(item => item.id === agreementId)

  function selectAgreement(id: string, available = agreements) {
    const agreement = available.find(item => item.id === id)
    setAgreementId(id)
    setTitle(agreement?.title ?? '')
    setDescription(agreement?.description ?? '')
    setAmount(decimalUsdc(agreement?.chain?.amountUsdcUnits))
    setDurationSeconds(agreement?.durationSeconds ?? 86400)
    setCancellationWindowSeconds(agreement?.cancellationWindowSeconds ?? 900)
    setAssessment(null)
    setRequestKey(idempotencyKey())
  }

  useEffect(() => {
    if (!ready || !authenticated) { setLoadingAgreements(false); return }
    let cancelled = false
    async function load() {
      setLoadingAgreements(true)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Sign in again to view funded agreements.')
        const response = await fetch(AGREEMENTS_API, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
        const body = await response.json().catch(() => ({})) as { agreements?: UpfrontAgreement[]; error?: string }
        if (!response.ok) throw new Error(body.error || 'Funded agreements could not be loaded.')
        const eligible = (body.agreements ?? []).filter(item => item.status === 'active' && item.template === 'fixed_unlock' && item.recipient?.toLowerCase() === UPFRONT_ARC_ROUTER.toLowerCase())
        if (cancelled) return
        setAgreements(eligible)
        if (eligible[0]) selectAgreement(eligible[0].id, eligible)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Funded agreements could not be loaded.')
      } finally {
        if (!cancelled) setLoadingAgreements(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken, ready])
  const valid = Boolean(
    selectedAgreement
    && selectedAgreement.status === 'active'
    && title.trim().length >= 3
    && description.trim().length >= 10
    && validUsdc(amount)
    && durationSeconds >= 3600
    && cancellationWindowSeconds >= 0
    && cancellationWindowSeconds < durationSeconds
    && isAddress(providerPayoutAddress)
    && !/^0x0{40}$/i.test(providerPayoutAddress),
  )

  function changeDraft(update: () => void) {
    update()
    setAssessment(null)
    setRequestKey(idempotencyKey())
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) {
      setError('Select a funded agreement and complete the X Layer payout details.')
      return
    }
    setSubmitting(true)
    setError('')
    setAssessment(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to request an assessment.')
      const response = await fetch(API, {
        method: 'POST',
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': requestKey },
        body: JSON.stringify({
          agreementId,
          template: 'fixed_unlock',
          title,
          description,
          amount,
          durationSeconds,
          cancellationWindowSeconds,
          providerPayoutAddress,
          requestedAdvanceBps,
        }),
      })
      const body = await response.json().catch(() => ({})) as { assessment?: Assessment; error?: string }
      if (!response.ok || !body.assessment) throw new Error(body.error || 'The Upfront assessment could not be completed.')
      setAssessment(body.assessment)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Upfront assessment could not be completed.')
      setRequestKey(idempotencyKey())
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready) return <div className="flex min-h-[58vh] items-center justify-center"><ArrowPathIcon className="h-5 w-5 animate-spin text-gray-300" /></div>
  if (!authenticated) return (
    <section className="flex min-h-[64vh] w-full max-w-md flex-col items-center justify-center text-center">
      <ShieldCheckIcon className="h-12 w-12 text-blue-600" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Check an agreement for Upfront.</h1>
      <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Sign in to request bounded agreement intelligence and underwriting.</p>
      <AuthButton debugLabel="hashpaystream-upfront" className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Continue with email</AuthButton>
    </section>
  )

  return (
    <section className="w-full max-w-3xl py-8 sm:py-12">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">HashPayStream Upfront</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">Turn clear work into a verifiable advance offer.</h1>
        <p className="mt-4 text-sm leading-7 text-gray-500 dark:text-gray-400">Select a customer-funded Arc agreement. ZeroScout verifies the evidence and PolyDesk sets the maximum X Layer advance before it can be shown to a funder.</p>
        <Link to={fundingDeskTo} className="mt-5 inline-flex rounded-xl border border-gray-200 px-3.5 py-2.5 text-xs font-semibold text-gray-700 hover:border-gray-300 dark:border-white/10 dark:text-gray-200">Open private funding desk</Link>
      </div>

      <form onSubmit={submit} className="mt-8 rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">Funded Arc agreement<select className={inputClass} value={agreementId} disabled={loadingAgreements || agreements.length === 0} onChange={event => selectAgreement(event.target.value)}><option value="">{loadingAgreements ? 'Loading funded agreements…' : agreements.length ? 'Select an agreement' : 'No eligible funded agreements'}</option>{agreements.map(item => <option key={item.id} value={item.id}>{item.title || item.id} · {decimalUsdc(item.chain?.amountUsdcUnits)} USDC</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">Agreement title<input className={inputClass} value={title} readOnly /></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">What will be delivered?<textarea className={`${inputClass} resize-none`} value={description} readOnly rows={3} /></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Protected on Arc<input className={inputClass} value={amount ? `${amount} USDC` : ''} readOnly /></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Requested advance<select className={inputClass} value={requestedAdvanceBps} onChange={event => changeDraft(() => setRequestedAdvanceBps(Number(event.target.value)))}><option value={2000}>20%</option><option value={3000}>30%</option><option value={4000}>40%</option><option value={5000}>50%</option></select></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Delivery period<select className={inputClass} value={durationSeconds} disabled><option value={7200}>2 hours</option><option value={86400}>1 day</option><option value={259200}>3 days</option><option value={604800}>7 days</option><option value={2592000}>30 days</option></select></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Payer cancellation period<select className={inputClass} value={cancellationWindowSeconds} disabled><option value={0}>None</option><option value={900}>15 minutes</option><option value={3600}>1 hour</option></select></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">Provider payout address on X Layer<input className={inputClass} value={providerPayoutAddress} onChange={event => changeDraft(() => setProviderPayoutAddress(event.target.value.trim()))} placeholder="0x..." /></label>
        </div>
        {error && <p role="alert" className="mt-5 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button disabled={!valid || submitting} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950">
          {submitting ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BanknotesIcon className="h-4 w-4" />}
          {submitting ? 'Checking agreement' : 'Create funding opportunity'}
        </button>
      </form>

      {assessment && <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
        <div className="flex items-start gap-3"><CheckBadgeIcon className="mt-0.5 h-6 w-6 text-blue-600" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{assessment.decision.decision}</p><h2 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">Agreement assessment complete</h2></div></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Result label="Evidence" value={assessment.intelligence.evidenceGrade} />
          <Result label="Confidence" value={`${assessment.intelligence.confidence}%`} />
          <Result label="Maximum advance" value={`${assessment.decision.maximumAdvanceBps / 100}%`} />
        </div>
        <p className="mt-5 text-sm leading-6 text-gray-500 dark:text-gray-400">{assessment.intelligence.summary}</p>
        {assessment.decision.onchainOffer
          ? <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">Signed X Layer offer ready for contract verification. Protected amount: {usdc(assessment.decision.onchainOffer.message.protectedAmount)}. No funds have moved.</div>
          : <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No onchain offer was issued. Human review or stronger evidence is required before funding.</div>}
      </div>}
    </section>
  )
}

function Result({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">{label}</p><p className="mt-2 text-sm font-semibold capitalize text-gray-950 dark:text-white">{value}</p></div>
}
