import { useState, type FormEvent, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, CheckIcon, ClipboardIcon, LockClosedIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Link } from '../../lib/router'
import { isAddress } from 'viem'
import { useStreamPayPath } from '../../lib/useStreamPayPath'
import { LoadingRing } from '../ui/LoadingRing'
import { StreamPayEmailLogin } from '../auth/StreamPayEmailLogin'
import { AgreementProgress } from '../ui/AgreementProgress'
import { StreamSelect } from '../ui/StreamSelect'

type CreatedAgreement = {
  agreement: { id: string; title: string; amount: string; recipient: string; template?: AgreementTemplate }
  payerReviewPath: string
}

type AgreementTemplate = 'fixed_unlock' | 'progressive_release' | 'milestone'
type MilestoneDraft = { label: string; percentage: string }

const APP_ORIGIN = String(import.meta.env.VITE_HASH_PAYLINK_BASE_URL || 'https://app.hashpaylink.com').replace(/\/$/, '')
const AGREEMENTS_API = '/api/hashpaystream/v2/agreements'
const UPFRONT_AGREEMENTS_API = '/api/hashpaystream/v1/upfront/agreements'
const UPFRONT_ENABLED = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ENABLED ?? '').toLowerCase() === 'true'
const DIRECT_ARC_ENABLED = String(import.meta.env.VITE_HASHPAYSTREAM_DIRECT_ARC_ENABLED ?? '').toLowerCase() === 'true'
const UPFRONT_ARC_ROUTER = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS ?? '0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE')

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

export default function FixedAgreementForm() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [template, setTemplate] = useState<AgreementTemplate>('fixed_unlock')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [payerEmail, setPayerEmail] = useState('')
  const [recipient, setRecipient] = useState('')
  const [useUpfront, setUseUpfront] = useState(UPFRONT_ENABLED)
  const [durationSeconds, setDurationSeconds] = useState('86400')
  const [cancellationWindowSeconds, setCancellationWindowSeconds] = useState('900')
  const [idempotencyKey] = useState(newIdempotencyKey)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedAgreement | null>(null)
  const [copied, setCopied] = useState(false)
  const [progressReleaseCount, setProgressReleaseCount] = useState<2 | 4>(4)
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { label: '', percentage: '50' },
    { label: '', percentage: '50' },
  ])
  const agreementsTo = useStreamPayPath('/agreements')
  const effectiveRecipient = useUpfront ? UPFRONT_ARC_ROUTER : recipient

  const payerUrl = created?.payerReviewPath ? `${APP_ORIGIN}${created.payerReviewPath}` : ''
  const milestoneShares = milestones.map(item => Number(item.percentage))
  const checkpoints = progressReleaseCount === 2
    ? [{ label: 'Half complete', percentage: 50 }, { label: 'Complete', percentage: 100 }]
    : [
        { label: '25% complete', percentage: 25 },
        { label: 'Half complete', percentage: 50 },
        { label: '75% complete', percentage: 75 },
        { label: 'Complete', percentage: 100 },
      ]
  const milestonesValid = template !== 'milestone' || (
    milestones.length >= 2
    && milestones.length <= 5
    && milestones.every((item, index) => (
      item.label.replace(/\s+/g, ' ').trim().length >= 2
      && Number.isInteger(milestoneShares[index])
      && milestoneShares[index] >= 1
      && milestoneShares[index] <= 100
    ))
    && milestoneShares.reduce((sum, value) => sum + value, 0) === 100
  )
  const duration = Number(durationSeconds)
  const cancellationWindow = Number(cancellationWindowSeconds)
  const normalizedPayerEmail = payerEmail.trim().toLowerCase()
  const formReady = (
    title.replace(/\s+/g, ' ').trim().length >= 3
    && description.replace(/\s+/g, ' ').trim().length >= 10
    && validAmount(amount)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedPayerEmail)
    && isAddress(effectiveRecipient)
    && !/^0x0{40}$/i.test(effectiveRecipient)
    && Number.isInteger(duration)
    && duration >= 3_600
    && Number.isInteger(cancellationWindow)
    && cancellationWindow >= 0
    && cancellationWindow < duration
    && milestonesValid
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!formReady) {
      setError('Complete every required field before creating the payer link.')
      return
    }
    const normalizedMilestones = milestones.map(item => ({
      label: item.label.trim(),
      percentage: Number(item.percentage),
    }))
    if (template === 'milestone') {
      if (normalizedMilestones.some(item => item.label.length < 2 || !Number.isInteger(item.percentage) || item.percentage < 1)) {
        setError('Each milestone needs a name and a whole-number share.')
        return
      }
      if (normalizedMilestones.reduce((sum, item) => sum + item.percentage, 0) !== 100) {
        setError('Milestone shares must total 100%.')
        return
      }
    }
    setSubmitting(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to create this agreement.')
      const useUpfrontRoute = UPFRONT_ENABLED && useUpfront && template === 'fixed_unlock'
      const response = await fetch(useUpfrontRoute ? UPFRONT_AGREEMENTS_API : AGREEMENTS_API, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          template,
          title,
          description,
          amount,
          payerEmail: normalizedPayerEmail,
          recipient: effectiveRecipient,
          durationSeconds: Number(durationSeconds),
          cancellationWindowSeconds: Number(cancellationWindowSeconds),
          ...(template === 'progressive_release' ? { checkpoints } : {}),
          ...(template === 'milestone' ? { milestones: normalizedMilestones } : {}),
        }),
      })
      const data = await response.json().catch(() => undefined) as (CreatedAgreement & { ok?: boolean; error?: string }) | undefined
      if (!response.ok || !data?.ok || !data.payerReviewPath) {
        throw new Error(data?.error || 'The agreement could not be created.')
      }
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

  if (!ready) {
    return <div className="flex min-h-[58vh] items-center justify-center"><LoadingRing className="h-5 w-5 text-gray-300" /></div>
  }

  if (!authenticated) {
    return (
      <section className="flex min-h-[64vh] w-full max-w-md flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
          <LockClosedIcon className="h-5 w-5" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Create an agreement.</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Sign in to create and manage your agreements.</p>
        <StreamPayEmailLogin className="mt-7 w-full" />
      </section>
    )
  }

  if (created) {
    return (
      <section className="w-full max-w-xl py-8 sm:py-12">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckIcon className="h-5 w-5" />
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Agreement ready</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">Send this link to your customer.</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {created.agreement.amount} USDC · {created.agreement.title}
          </p>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">Private payer link</p>
            <p className="mt-2 break-all text-xs leading-5 text-gray-600 dark:text-gray-300">{payerUrl}</p>
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-400">Only {normalizedPayerEmail} can open, fund, approve, cancel, or refund this agreement.</p>
          {useUpfront && <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">After the payer funds this agreement, return to HashPayStream and request an X Layer advance. The Arc repayment router was assigned automatically.</div>}

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-white/10 dark:text-white"
            >
              {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={payerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"
            >
              Open checkout
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </div>
          <Link to={agreementsTo} className="mt-3 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
            View agreements
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="w-full max-w-xl py-8 sm:py-12">
      <Link to={agreementsTo} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
        <ArrowLeftIcon className="h-4 w-4" />
        Agreements
      </Link>
      <div className="mt-8 flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Create</p>
        <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">Arc test network</span>
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">New agreement</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
        {template === 'fixed_unlock'
          ? 'Protect one USDC payment and release it when the work is complete.'
          : template === 'progressive_release'
            ? 'Protect the full payment and release it as the work progresses.'
            : 'Protect the full payment and release it as each milestone is approved.'}
      </p>
      <p className="mt-2 text-xs leading-5 text-gray-400">You create the terms. The payer funds the agreement and approves each release.</p>
      <div className="mt-6">
        <AgreementProgress
          current={1}
          steps={useUpfront
            ? [
                { label: 'Create terms', detail: 'Describe the job' },
                { label: 'Customer funds', detail: 'Test USDC on Arc' },
                { label: 'Request advance', detail: 'AI checks the risk' },
                { label: 'Funder sends', detail: 'USDC on X Layer' },
              ]
            : [
                { label: 'Create terms', detail: 'Describe the payment' },
                { label: 'Customer funds', detail: 'Test USDC on Arc' },
                { label: 'Complete work', detail: 'Submit delivery proof' },
                { label: 'Customer releases', detail: 'Approve payment' },
              ]}
        />
      </div>

      <form onSubmit={submit} className="mt-7 space-y-5 rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-7">
        {DIRECT_ARC_ENABLED && <Field label="Payment structure">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['fixed_unlock', 'One release', 'One release'],
              ['progressive_release', 'Progress', 'Progress releases'],
              ['milestone', 'Milestones', 'Milestones'],
            ] as const).map(([value, mobileLabel, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTemplate(value); if (value !== 'fixed_unlock') setUseUpfront(false); setError('') }}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${template === value
                  ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                  : 'border-gray-200 text-gray-500 dark:border-white/10 dark:text-gray-400'}`}
              >
                <span className="sm:hidden">{mobileLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </Field>}
        {UPFRONT_ENABLED && template === 'fixed_unlock' && (
          <Field label="Payment option">
            {DIRECT_ARC_ENABLED ? <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={!useUpfront} onClick={() => setUseUpfront(false)} className={'rounded-xl border p-3 text-left transition-colors ' + (!useUpfront ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950' : 'border-gray-200 text-gray-600 dark:border-white/10 dark:text-gray-300')}>
                <span className="block text-sm font-bold">Arc protected payment</span>
                <span className="mt-1 block text-[11px] leading-5 opacity-70">Customer protects test USDC on Arc and releases it after delivery.</span>
              </button>
              <button type="button" aria-pressed={useUpfront} onClick={() => setUseUpfront(true)} className={'rounded-xl border p-3 text-left transition-colors ' + (useUpfront ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-600 dark:border-white/10 dark:text-gray-300')}>
                <span className="block text-sm font-bold">X Layer early payment</span>
                <span className="mt-1 block text-[11px] leading-5 opacity-70">After Arc funding, request an AI-assessed advance on X Layer.</span>
              </button>
            </div> : <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10"><p className="text-sm font-bold text-blue-950 dark:text-blue-100">Get paid early on X Layer</p><p className="mt-1 text-[11px] leading-5 text-blue-800 dark:text-blue-200">Your customer first protects test USDC on Arc. After funding, AI checks the agreement before an approved funder can send your advance.</p></div>}
          </Field>
        )}
        <Field label="Agreement title">
          <input value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={140} placeholder="Website design delivery" className={inputClass} />
        </Field>
        <Field label="What is being delivered?">
          <textarea value={description} onChange={event => setDescription(event.target.value)} required minLength={10} maxLength={800} rows={3} placeholder="Describe the work or product covered by this payment." className={`${inputClass} resize-none`} />
        </Field>
        <Field label="Customer email">
          <input value={payerEmail} onChange={event => { setPayerEmail(event.target.value); setError('') }} required type="email" inputMode="email" autoComplete="email" spellCheck={false} placeholder="customer@example.com" className={inputClass} />
          <span className="mt-2 block text-[11px] leading-5 text-gray-400">Only this email can open and fund the private agreement.</span>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <div className="relative">
              <input value={amount} onChange={event => setAmount(event.target.value)} required inputMode="decimal" placeholder="0.10" className={`${inputClass} pr-16`} />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-gray-400">USDC</span>
            </div>
          </Field>
          {useUpfront ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10">
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">Upfront repayment routing</p>
              <p className="mt-1 text-[11px] leading-5 text-blue-700 dark:text-blue-200">The customer payment is protected on Arc and settles the advance after approved delivery. You never need to enter the router address.</p>
            </div>
          ) : DIRECT_ARC_ENABLED ? (
          <Field label="Recipient wallet address">
            <input value={recipient} onChange={event => setRecipient(event.target.value.trim())} required placeholder="0x…" className={inputClass} />
            <span className="mt-2 block text-[11px] text-gray-400">Arc test network only.</span>
          </Field>
          ) : null}
        </div>

        {template === 'progressive_release' && (
          <Field label="Progress releases">
            <div className="grid grid-cols-2 gap-2">
              {([2, 4] as const).map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setProgressReleaseCount(count)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${progressReleaseCount === count
                    ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                    : 'border-gray-200 text-gray-500 dark:border-white/10 dark:text-gray-400'}`}
                >
                  {count} releases
                </button>
              ))}
            </div>
            <span className="mt-2 block text-[11px] leading-5 text-gray-400">
              {checkpoints.map(item => `${item.percentage}%`).join(' · ')}. The payer reviews every release.
            </span>
          </Field>
        )}

        {template === 'milestone' && (
          <div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Milestones</p>
                <p className="mt-1 text-[11px] text-gray-400">Each share releases only after payer approval.</p>
              </div>
              <p className={`text-xs font-semibold ${milestones.reduce((sum, item) => sum + Number(item.percentage || 0), 0) === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {milestones.reduce((sum, item) => sum + Number(item.percentage || 0), 0)}%
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {milestones.map((milestone, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_72px_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_84px_auto]">
                  <input
                    value={milestone.label}
                    onChange={event => setMilestones(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder={`Milestone ${index + 1}`}
                    className={inputClass}
                  />
                  <div className="relative">
                    <input
                      value={milestone.percentage}
                      onChange={event => setMilestones(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: event.target.value.replace(/\D/g, '').slice(0, 3) } : item))}
                      required
                      inputMode="numeric"
                      aria-label={`Milestone ${index + 1} share`}
                      className={`${inputClass} pr-7`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">%</span>
                  </div>
                  <button
                    type="button"
                    disabled={milestones.length <= 2}
                    onClick={() => setMilestones(current => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="flex h-11 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
                    aria-label={`Remove milestone ${index + 1}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {milestones.length < 5 && (
              <button
                type="button"
                onClick={() => setMilestones(current => [...current, { label: '', percentage: '' }])}
                className="mt-3 text-xs font-semibold text-gray-600 dark:text-gray-300"
              >
                Add milestone
              </button>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Protection period">
            <StreamSelect label="Protection period" value={durationSeconds} onChange={setDurationSeconds} options={[{ value: '7200', label: '2 hours' }, { value: '86400', label: '1 day' }, { value: '259200', label: '3 days' }, { value: '604800', label: '7 days' }]} />
          </Field>
          <Field label="Early cancellation">
            <StreamSelect label="Early cancellation" value={cancellationWindowSeconds} onChange={setCancellationWindowSeconds} options={[{ value: '0', label: 'No cancellation window' }, { value: '900', label: '15 minutes' }, { value: '3600', label: '1 hour' }]} />
          </Field>
        </div>
        <p className="text-[11px] leading-5 text-gray-400">
          After the protection period ends, unreleased USDC becomes refundable to the payer. Refunds require payer confirmation and are not automatic.
        </p>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={!formReady || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:bg-white dark:text-gray-950 dark:disabled:bg-white/10 dark:disabled:text-gray-600"
        >
          {submitting && <LoadingRing className="h-4 w-4" label="Creating agreement" />}
          Create private payer link
        </button>
      </form>
    </section>
  )
}

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-950 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-500 dark:border-white/10 dark:bg-[#111113] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/30'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  )
}
