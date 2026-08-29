import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { BanknotesIcon, CheckBadgeIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useLocation } from '../lib/router'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
import StreamPayGrow from './StreamPayGrow'
import StreamPayFundingDesk from './StreamPayFundingDesk'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import { StreamSelect } from './ui/StreamSelect'

const API = '/api/hashpaystream/v1/funding-partners'
const inputClass = 'mt-1.5 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm text-gray-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white'

type Profile = {
  email: string
  status: 'not_applied' | 'pending' | 'approved' | 'restricted'
  application?: { name?: string }
}

export default function StreamPayFunding() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const { search } = useLocation()
  const fundingMode = new URLSearchParams(search).get('view') === 'funding'
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const [profile, setProfile] = useState<Profile>()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ name: '', country: '', applicantType: 'individual', experience: 'new', expectedFundingRange: '' })

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(API, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json().catch(() => ({})) as { profile?: Profile; error?: string }
    if (!response.ok || !data.profile) throw new Error(data.error || 'Your funding profile could not be loaded.')
    return data.profile
  }, [getAccessToken])

  useEffect(() => {
    if (!ready) return
    if (!authenticated) { setLoading(false); return }
    void request().then(setProfile).catch(reason => setError(reason instanceof Error ? reason.message : 'Your funding profile could not be loaded.')).finally(() => setLoading(false))
  }, [authenticated, ready, request])

  async function apply() {
    setSubmitting(true)
    setError('')
    try {
      setProfile(await request({ action: 'apply', ...form }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your application could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) return <StreamPayLoadingState active="home" />
  if (!fundingMode) return <StreamPayGrow fundingStatus={profile?.status} />
  if (profile?.status === 'approved') return <StreamPayFundingDesk />

  if (profile?.status === 'pending') return (
    <section className="flex min-h-[65vh] w-full max-w-lg flex-col items-center justify-center px-2 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300"><ClockIcon className="h-7 w-7" /></span>
      <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Application received</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 dark:text-white">Your application is under review</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">We will email {profile.email} when your HashPayStream account is approved for funding access.</p>
      <div className="mt-7 w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left text-xs leading-5 text-gray-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-gray-400">You keep using the same HashPayStream account. No separate funder sign-in is required.</div>
    </section>
  )

  if (profile?.status === 'restricted') return (
    <section className="flex min-h-[65vh] w-full max-w-lg flex-col items-center justify-center text-center">
      <ExclamationTriangleIcon className="h-12 w-12 text-gray-400" />
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-gray-950 dark:text-white">Funding access is unavailable</h1>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Contact HashPayStream support if you believe this decision is incorrect.</p>
    </section>
  )

  if (!formOpen) return (
    <section className="flex min-h-[72vh] w-full max-w-md flex-col items-center justify-center px-3 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><BanknotesIcon className="h-7 w-7" /></span>
      <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Funding partners</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-950 dark:text-white">Fund good work early.</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">Apply to receive private early-pay requests and review the exact settlement before you fund.</p>
      <button type="button" onClick={() => setFormOpen(true)} className="mt-7 w-full rounded-full bg-gray-950 px-6 py-4 text-sm font-bold text-white shadow-sm dark:bg-white dark:text-gray-950">Apply to be a funding partner</button>
      <p className="mt-3 text-[10px] leading-4 text-gray-400">Your existing HashPayStream account is used. No second sign-in.</p>
    </section>
  )

  return (
    <section className="stream-screen w-full max-w-md py-5 sm:py-8">
      <button type="button" onClick={() => setFormOpen(false)} className="mb-4 text-xs font-bold text-gray-500">&larr; Funding partners</button>
      <div className="stream-card p-5">
        <div className="flex items-start gap-3">
          <CheckBadgeIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div><h2 className="text-base font-bold text-gray-950 dark:text-white">Apply with your HashPayStream account</h2><p className="mt-1 text-xs leading-5 text-gray-500">Your verified email is {profile?.email || 'connected to this account'}. KYC will be required before live-money access.</p></div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Full name or company name<input className={inputClass} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} autoComplete="name" /></label>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Country<input className={inputClass} value={form.country} onChange={event => setForm(current => ({ ...current, country: event.target.value }))} autoComplete="country-name" /></label>
          <label className="space-y-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">Applicant type<StreamSelect label="Applicant type" value={form.applicantType} options={[{ value: 'individual', label: 'Individual' }, { value: 'company', label: 'Company' }]} onChange={applicantType => setForm(current => ({ ...current, applicantType }))} /></label>
          <label className="space-y-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">Funding experience<StreamSelect label="Funding experience" value={form.experience} options={[{ value: 'new', label: 'New to private funding' }, { value: 'some', label: 'Some experience' }, { value: 'experienced', label: 'Experienced' }]} onChange={experience => setForm(current => ({ ...current, experience }))} /></label>
          <label className="space-y-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">Expected funding range<StreamSelect label="Expected funding range" value={form.expectedFundingRange} options={[{ value: '', label: 'Select a range' }, { value: 'under_1k', label: 'Under 1,000 USDC' }, { value: '1k_10k', label: '1,000-10,000 USDC' }, { value: '10k_plus', label: 'More than 10,000 USDC' }]} onChange={expectedFundingRange => setForm(current => ({ ...current, expectedFundingRange }))} /></label>
        </div>
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700 dark:bg-red-400/10 dark:text-red-300">{error}</p>}
        <button type="button" disabled={submitting || form.name.trim().length < 2 || form.country.trim().length < 2 || !form.expectedFundingRange} onClick={() => void apply()} className="mt-6 flex w-full items-center justify-center rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{submitting ? 'Submitting...' : 'Submit for team review'}</button>
        <p className="mt-3 text-center text-[10px] leading-4 text-gray-400">Submitting does not guarantee approval or move any funds.</p>
      </div>
    </section>
  )
}
