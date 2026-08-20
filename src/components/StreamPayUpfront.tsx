import { useState, type FormEvent } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowPathIcon, BanknotesIcon, CheckBadgeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { isAddress } from 'viem'
import { AuthButton } from '../lib/AuthButton'

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

const API = '/api/hashpaystream/v1/upfront/assessments'
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
  const valid = Boolean(
    title.trim().length >= 3
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
      setError('Complete the agreement terms and payout details first.')
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
        <p className="mt-4 text-sm leading-7 text-gray-500 dark:text-gray-400">Describe the work before asking the payer to fund it. ZeroScout checks the evidence and PolyDesk applies the advance policy. An approval produces an X Layer testnet offer; this screen does not move funds.</p>
      </div>

      <form onSubmit={submit} className="mt-8 rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">Agreement title<input className={inputClass} value={title} onChange={event => changeDraft(() => setTitle(event.target.value))} placeholder="Website delivery" maxLength={140} /></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">What will be delivered?<textarea className={`${inputClass} resize-none`} value={description} onChange={event => changeDraft(() => setDescription(event.target.value))} placeholder="Describe the completed work the payer will receive." rows={3} maxLength={800} /></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Agreement amount<input className={inputClass} value={amount} onChange={event => changeDraft(() => setAmount(event.target.value.trim()))} placeholder="100.00 USDC" inputMode="decimal" /></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Requested advance<select className={inputClass} value={requestedAdvanceBps} onChange={event => changeDraft(() => setRequestedAdvanceBps(Number(event.target.value)))}><option value={2000}>20%</option><option value={3000}>30%</option><option value={4000}>40%</option><option value={5000}>50%</option></select></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Delivery period<select className={inputClass} value={durationSeconds} onChange={event => changeDraft(() => setDurationSeconds(Number(event.target.value)))}><option value={86400}>1 day</option><option value={259200}>3 days</option><option value={604800}>7 days</option><option value={2592000}>30 days</option></select></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Payer cancellation period<select className={inputClass} value={cancellationWindowSeconds} onChange={event => changeDraft(() => setCancellationWindowSeconds(Number(event.target.value)))}><option value={0}>None</option><option value={900}>15 minutes</option><option value={3600}>1 hour</option></select></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">Provider payout address on X Layer<input className={inputClass} value={providerPayoutAddress} onChange={event => changeDraft(() => setProviderPayoutAddress(event.target.value.trim()))} placeholder="0x..." /></label>
        </div>
        {error && <p role="alert" className="mt-5 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button disabled={!valid || submitting} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950">
          {submitting ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BanknotesIcon className="h-4 w-4" />}
          {submitting ? 'Checking agreement' : 'Check before funding'}
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
