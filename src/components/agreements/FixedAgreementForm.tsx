import { useState, type FormEvent, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, CheckIcon, ClipboardIcon } from '@heroicons/react/24/outline'
import { isAddress } from 'viem'
import { Link } from '../../lib/router'
import { useStreamPayPath } from '../../lib/useStreamPayPath'
import { useCircleWallet } from '../../lib/circleWallet'
import { LoadingRing } from '../ui/LoadingRing'
import { StreamSelect } from '../ui/StreamSelect'

type CreatedAgreement = {
  agreement: { id: string; title: string; amount: string }
  payerReviewPath: string
}

const APP_ORIGIN = String(import.meta.env.VITE_HASH_PAYLINK_BASE_URL || 'https://app.hashpaylink.com').replace(/\/$/, '')
const AGREEMENTS_API = '/api/hashpaystream/v2/agreements'
const UPFRONT_AGREEMENTS_API = '/api/hashpaystream/v1/upfront/agreements'
const UPFRONT_ARC_ROUTER = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS || '0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE')

function newIdempotencyKey() {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `hashpaystream:${suffix}`
}

function validAmount(value: string) {
  const normalized = value.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) return false
  const [whole, fraction = ''] = normalized.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')) > 0n
}

export default function FixedAgreementForm({ mode = 'standard' }: { mode?: 'standard' | 'early' }) {
  const { getAccessToken } = usePrivy()
  const circle = useCircleWallet()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [payerEmail, setPayerEmail] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('86400')
  const [cancellationWindowSeconds, setCancellationWindowSeconds] = useState('900')
  const [idempotencyKey] = useState(newIdempotencyKey)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedAgreement | null>(null)
  const [copied, setCopied] = useState(false)
  const isEarly = mode === 'early'
  const homeTo = useStreamPayPath('/home')
  const effectiveRecipient = isEarly ? UPFRONT_ARC_ROUTER : circle.address
  const normalizedPayerEmail = payerEmail.trim().toLowerCase()
  const duration = Number(durationSeconds)
  const cancellationWindow = Number(cancellationWindowSeconds)
  const payerUrl = created?.payerReviewPath ? `${APP_ORIGIN}${created.payerReviewPath}` : ''
  const formReady = title.trim().length >= 3
    && description.trim().length >= 10
    && validAmount(amount)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedPayerEmail)
    && isAddress(effectiveRecipient)
    && !/^0x0{40}$/i.test(effectiveRecipient)
    && Number.isInteger(duration)
    && duration >= 3_600
    && Number.isInteger(cancellationWindow)
    && cancellationWindow >= 0
    && cancellationWindow < duration

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!formReady) {
      setError('Complete every required field before creating the request.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to create this agreement.')
      const response = await fetch(isEarly ? UPFRONT_AGREEMENTS_API : AGREEMENTS_API, {
        method: 'POST', cache: 'no-store',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ template: 'fixed_unlock', title: title.trim(), description: description.trim(), amount, payerEmail: normalizedPayerEmail, recipient: effectiveRecipient, durationSeconds: duration, cancellationWindowSeconds: cancellationWindow }),
      })
      const data = await response.json().catch(() => undefined) as (CreatedAgreement & { ok?: boolean; error?: string }) | undefined
      if (!response.ok || !data?.ok || !data.payerReviewPath) throw new Error(data?.error || 'The agreement could not be created.')
      setCreated(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The agreement could not be created.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLink() {
    if (!payerUrl) return
    await navigator.clipboard.writeText(payerUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (created) {
    return <section className="w-full max-w-md py-6"><div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white"><CheckIcon className="h-5 w-5" /></div>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white">Request ready</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{created.agreement.amount} USDC · {created.agreement.title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-400">Only {normalizedPayerEmail} can review and fund it.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copyLink()} className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold text-gray-900 dark:border-white/10 dark:text-white">{copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}</button>
        <a href={payerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-3 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Preview <ArrowTopRightOnSquareIcon className="h-4 w-4" /></a>
      </div>
      <Link to={homeTo} className="mt-2 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Done</Link>
    </div></section>
  }

  return <section className="w-full max-w-md py-5 sm:py-8">
    <Link to={homeTo} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm dark:bg-white/[0.06] dark:text-white" aria-label="Back home"><ArrowLeftIcon className="h-4 w-4" /></Link>
    <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white">{isEarly ? 'Early pay' : 'New agreement'}</h1>
    <form onSubmit={submit} className="mt-5 space-y-5 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <Field label="Agreement title"><input value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={140} placeholder="Website design delivery" className={inputClass} /></Field>
      <Field label="What will you deliver?"><textarea value={description} onChange={event => setDescription(event.target.value)} required minLength={10} maxLength={800} rows={3} placeholder="Describe the work covered by this payment." className={`${inputClass} resize-none`} /></Field>
      <Field label="Customer email"><input value={payerEmail} onChange={event => { setPayerEmail(event.target.value); setError('') }} required type="email" inputMode="email" autoComplete="email" spellCheck={false} placeholder="customer@example.com" className={inputClass} /><span className="mt-2 block text-[11px] leading-5 text-gray-400">The request appears only in this customer's account.</span></Field>
      <Field label="Protected amount"><div className="relative"><input value={amount} onChange={event => setAmount(event.target.value)} required inputMode="decimal" placeholder="0.10" className={`${inputClass} pr-16`} /><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-gray-400">USDC</span></div></Field>
      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-white/[0.04]"><div><p className="text-xs font-medium text-gray-700 dark:text-gray-200">{isEarly ? 'Arc repayment routing' : 'Circle wallet'}</p><p className="mt-0.5 text-[11px] text-gray-400">{isEarly ? 'Assigned automatically' : 'Receives released USDC'}</p></div>{!isEarly && <p className="max-w-[120px] truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{circle.address}</p>}{isEarly && <CheckIcon className="h-4 w-4 text-emerald-500" />}</div>
      <div className="grid grid-cols-2 gap-3"><Field label="Protection period"><StreamSelect label="Protection period" value={durationSeconds} onChange={setDurationSeconds} options={[{ value: '7200', label: '2 hours' }, { value: '86400', label: '1 day' }, { value: '259200', label: '3 days' }, { value: '604800', label: '7 days' }]} /></Field><Field label="Cancellation"><StreamSelect label="Cancellation" value={cancellationWindowSeconds} onChange={setCancellationWindowSeconds} options={[{ value: '0', label: 'None' }, { value: '900', label: '15 minutes' }, { value: '3600', label: '1 hour' }]} /></Field></div>
      <p className="text-[11px] leading-5 text-gray-400">After the protection period, unreleased USDC can be refunded only after payer confirmation.</p>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</p>}
      <button type="submit" disabled={!formReady || submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:bg-white dark:text-gray-950 dark:disabled:bg-white/10 dark:disabled:text-gray-600">{submitting && <LoadingRing className="h-4 w-4" label="Creating request" />}{isEarly ? 'Create early pay request' : 'Create job request'}</button>
    </form>
  </section>
}

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-950 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-500 dark:border-white/10 dark:bg-[#111113] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/30'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>{children}</label>
}
