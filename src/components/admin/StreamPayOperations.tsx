import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { CheckIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useHashPayStreamSessionSplash } from '../../lib/useHashPayStreamSessionSplash'
import { AgreementSignInLanding } from '../agreements/AgreementSignInLanding'
import { LoadingRing } from '../ui/LoadingRing'

const API = '/api/hashpaystream/v1/funding-partners'
type Application = {
  id: string; email: string; name: string; country: string
  applicantType: 'individual' | 'company'; experience: string
  expectedFundingRange: string; status: 'pending' | 'approved' | 'restricted'; updatedAt: string
}

export default function StreamPayOperations() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState('')

  const token = useCallback(async () => {
    const value = await getAccessToken()
    if (!value) throw new Error('Sign in again to open Operations.')
    return value
  }, [getAccessToken])

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}?review=1`, { cache: 'no-store', headers: { authorization: `Bearer ${await token()}` } })
      const body = await response.json().catch(() => ({})) as { applications?: Application[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Funding applications could not be loaded.')
      setApplications(body.applications ?? [])
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Funding applications could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { if (ready && authenticated) void load(); else if (ready) setLoading(false) }, [authenticated, load, ready])

  async function review(applicationId: string, status: 'approved' | 'restricted') {
    setReviewing(applicationId)
    setError('')
    try {
      const response = await fetch(API, { method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', applicationId, status }) })
      const body = await response.json().catch(() => ({})) as { application?: Application; error?: string }
      if (!response.ok || !body.application) throw new Error(body.error || 'The review decision could not be saved.')
      setApplications(current => current.map(item => item.id === applicationId ? body.application! : item))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review decision could not be saved.')
    } finally {
      setReviewing('')
    }
  }

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) return <div className="flex min-h-[58vh] items-center justify-center"><LoadingRing className="h-5 w-5 text-gray-300" /></div>

  return (
    <section className="w-full max-w-4xl py-8 sm:py-12">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Private workspace</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 dark:text-white">Operations</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Review access requests without exposing operator controls in the customer application.</p>
      {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</div>}

      {!error && <div className="mt-7 space-y-3">
        {applications.map(application => (
          <article key={application.id} className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.035] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h2 className="truncate text-sm font-bold text-gray-950 dark:text-white">{application.name}</h2><span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-bold uppercase text-gray-500 dark:bg-white/[0.07]">{application.status}</span></div>
                <p className="mt-1 break-all text-xs text-gray-500">{application.email}</p>
                <p className="mt-3 text-xs text-gray-500">{application.country} · {application.applicantType} · {application.experience} · {application.expectedFundingRange.replaceAll('_', ' ')}</p>
              </div>
              {application.status === 'pending' && <div className="flex shrink-0 gap-2">
                <button type="button" disabled={reviewing === application.id} onClick={() => void review(application.id, 'restricted')} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-40 dark:border-white/10 dark:text-gray-300"><XMarkIcon className="h-4 w-4" />Restrict</button>
                <button type="button" disabled={reviewing === application.id} onClick={() => void review(application.id, 'approved')} className="inline-flex items-center gap-1.5 rounded-xl bg-gray-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"><CheckIcon className="h-4 w-4" />Approve</button>
              </div>}
            </div>
          </article>
        ))}
        {applications.length === 0 && <div className="rounded-3xl border border-dashed border-gray-200 py-14 text-center dark:border-white/10"><ShieldCheckIcon className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300">No funding applications yet</p></div>}
      </div>}
    </section>
  )
}
