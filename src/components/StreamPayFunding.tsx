import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, BanknotesIcon, CheckBadgeIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { Link, useLocation, useNavigate } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
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

const fundingProfileCache = new Map<string, Profile>()
export default function StreamPayFunding() {
  const { ready, authenticated, getAccessToken, user } = usePrivy()
  const { search } = useLocation()
  const navigate = useNavigate()
  const earnTo = useStreamPayPath('/funding')
  const applyTo = useStreamPayPath('/funding?view=apply')
  const view = new URLSearchParams(search).get('view')
  const fundingMode = view === 'funding'
  const applying = view === 'apply'
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const scope = authenticated ? user?.id ?? 'pending' : ''
  const cached = scope ? fundingProfileCache.get(scope) : undefined
  const [profile, setProfile] = useState<Profile | undefined>(() => cached)
  const [loading, setLoading] = useState(() => !cached)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', country: '', applicantType: 'individual', experience: 'new', expectedFundingRange: '' })

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetchWithTimeout(API, {
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
    void request().then(next => {
      fundingProfileCache.set(scope, next)
      setProfile(next)
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Your funding profile could not be loaded.')).finally(() => setLoading(false))
  }, [authenticated, ready, request, scope])

  async function apply() {
    setSubmitting(true)
    setError('')
    try {
      const next = await request({ action: 'apply', ...form })
      fundingProfileCache.set(scope, next)
      setProfile(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your application could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) return <StreamPayLoadingState active="funding" />
  if (!fundingMode && !applying) return <StreamPayGrow fundingStatus={profile?.status} />
  if (profile?.status === 'approved') return <StreamPayFundingDesk />

  if (profile?.status === 'pending') return (
    <section className="stream-screen w-full max-w-md py-5 sm:py-8">
      <FundingHeader backTo={earnTo} />
      <div className="stream-card mt-6 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300"><ClockIcon className="h-5 w-5" /></span>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Application received</p>
        <h1 className="mt-2 text-xl font-black tracking-tight text-gray-950 dark:text-white">Your application is under review</h1>
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">We will email {profile.email} when funding access is ready.</p>
        <p className="mt-5 rounded-2xl bg-zinc-50 px-4 py-3 text-[11px] leading-5 text-gray-500 dark:bg-white/[0.035] dark:text-gray-400">Keep using this HashPayStream account. No second sign-in is needed.</p>
      </div>
    </section>
  )

  if (profile?.status === 'restricted') return (
    <section className="stream-screen w-full max-w-md py-5 sm:py-8">
      <FundingHeader backTo={earnTo} />
      <div className="stream-card mt-6 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/[0.07] dark:text-zinc-300"><ExclamationTriangleIcon className="h-5 w-5" /></span>
        <h1 className="mt-5 text-xl font-black tracking-tight text-gray-950 dark:text-white">Funding access is unavailable</h1>
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">Contact HashPayStream support if you believe this is incorrect.</p>
      </div>
    </section>
  )

  if (!applying) return (
    <section className="stream-screen w-full max-w-md py-5 sm:py-8">
      <FundingHeader backTo={earnTo} />
      <div className="stream-card mt-6 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><BanknotesIcon className="h-5 w-5" /></span>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Private funding</p>
        <h1 className="mt-2 text-xl font-black tracking-tight text-gray-950 dark:text-white">Fund good work early</h1>
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">Apply to receive eligible early-pay requests sent directly to you.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700 dark:bg-red-400/10 dark:text-red-300">{error}</p>}
        <button type="button" onClick={() => navigate(applyTo)} className="stream-primary mt-6 w-full">Apply to be a funding partner</button>
        <p className="mt-3 text-center text-[10px] leading-4 text-gray-400">Use your existing HashPayStream account. No second sign-in.</p>
      </div>
    </section>
  )

  return (
    <section className="stream-screen w-full max-w-md py-5 sm:py-8">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(earnTo, { replace: true })} aria-label="Back to Funding partners" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></button>
        <h1 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">Apply</h1>
      </div>
      <div className="stream-card mt-6 p-5">
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
        <button type="button" disabled={submitting || form.name.trim().length < 2 || form.country.trim().length < 2 || !form.expectedFundingRange} onClick={() => void apply()} className="stream-primary mt-6 w-full">{submitting ? 'Submitting...' : 'Submit for team review'}</button>
        <p className="mt-3 text-center text-[10px] leading-4 text-gray-400">Submitting does not guarantee approval or move any funds.</p>
      </div>
    </section>
  )
}

function FundingHeader({ backTo }: { backTo: string }) {
  return <div className="flex items-center gap-3">
    <Link to={backTo} aria-label="Back to Earn" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link>
    <div><h1 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">Funding partners</h1><p className="mt-0.5 text-[11px] text-gray-400">Private early-pay funding.</p></div>
  </div>
}
