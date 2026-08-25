import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import {
  ArrowPathIcon,
  BanknotesIcon,
  ChartBarSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  CpuChipIcon,
  DocumentTextIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'
import { Link } from '../../lib/router'
import { useHashPayStreamSessionSplash } from '../../lib/useHashPayStreamSessionSplash'
import { AgreementSignInLanding } from '../agreements/AgreementSignInLanding'
import { LoadingRing } from '../ui/LoadingRing'
import FundingPartnerReviewPanel from './FundingPartnerReviewPanel'

const API = '/api/hashpaystream/v1/admin/analytics'

type Analytics = {
  generatedAt: string
  environment: string
  scope: { ownedAgreements: number }
  totals: {
    agreements: number
    awaitingFunding: number
    active: number
    completed: number
    cancelled: number
    refunded: number
    refundAvailable: number
  }
  modes: { human: number; upfront: number; agentic: number }
  funnel: { created: number; funded: number; deliverySubmitted: number; releaseApproved: number; completed: number }
  testUsdc: { protected: string; released: string; remaining: string }
  performance: { fundedCompletionRate: number | null; averageFundingHours: number | null; averageDeliveryReviewHours: number | null }
  infrastructure: {
    hashPayLink: Record<'human' | 'upfront' | 'agentic', { latencyMs: number }>
    latestLifecycleAt: string | null
  }
  privacy: string
}

type ApiResponse = { ok?: boolean; analytics?: Analytics; error?: string }

function when(value: string | null) {
  if (!value) return 'No lifecycle event yet'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function duration(value: number | null) {
  return value === null ? 'No data yet' : value < 1 ? '<1h' : `${value}h`
}

function Metric({ label, value, detail, Icon }: {
  label: string
  value: string
  detail: string
  Icon: typeof ChartBarSquareIcon
}) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{label}</p>
        <Icon className="h-4 w-4 text-blue-500" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </article>
  )
}

export default function StreamPayAnalytics() {
  const { ready, authenticated, getAccessToken, logout } = usePrivy()
  const [data, setData] = useState<Analytics>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const splashState = useHashPayStreamSessionSplash(!authenticated)

  const load = useCallback(async () => {
    if (!authenticated) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to view operations.')
      const response = await fetch(API, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}` },
      })
      const result = await response.json().catch(() => undefined) as ApiResponse | undefined
      if (!response.ok || !result?.ok || !result.analytics) {
        throw new Error(result?.error || 'Operations could not be loaded.')
      }
      setData(result.analytics)
      setError('')
    } catch (reason) {
      setData(undefined)
      setError(reason instanceof Error ? reason.message : 'Operations could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (ready) void load()
  }, [load, ready])

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) {
    return <section className="flex min-h-[58vh] items-center"><LoadingRing className="h-5 w-5 text-gray-300" /></section>
  }

  if (!data) {
    return (
      <section className="w-full max-w-3xl py-12">
        <div className="rounded-[1.75rem] border border-gray-200 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-[#111216]">
          <LockClosedIcon className="mx-auto h-7 w-7 text-gray-400" />
          <h1 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-gray-950 dark:text-white">Operations unavailable</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-6 rounded-full bg-gray-950 px-4 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Try again</button>
        </div>
      </section>
    )
  }

  const attention = data.totals.awaitingFunding + data.totals.active + data.totals.refundAvailable
  const paths = [
    ['Human standard', data.modes.human],
    ['Human Upfront', data.modes.upfront],
    ['Agent API', data.modes.agentic],
  ] as const
  const sources = [
    ['Agreements API', data.infrastructure.hashPayLink.human.latencyMs],
    ['Upfront API', data.infrastructure.hashPayLink.upfront.latencyMs],
    ['Agentic API', data.infrastructure.hashPayLink.agentic.latencyMs],
  ] as const

  return (
    <section className="w-full max-w-6xl py-7 sm:py-10">
      <header className="flex items-center justify-between">
        <Link to="/home" className="text-sm font-bold text-gray-950 dark:text-white">
          HashPayStream <span className="font-medium text-gray-400">Operations</span>
        </Link>
        <button type="button" onClick={() => void logout()} className="h-9 rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-500 dark:border-white/10 dark:text-gray-300">Sign out</button>
      </header>

      <div className="mt-7 flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="rounded-[1.5rem] border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-[#111216] lg:sticky lg:top-24 lg:w-64">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Workspace</p>
          <div className="space-y-1">
            <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 dark:bg-blue-400/15 dark:text-blue-200">Overview</div>
            <Link to="/agreements" className="block rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.05]">Agreements</Link>
            <Link to="/upfront" className="block rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.05]">Upfront</Link>
            <Link to="/activity" className="block rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.05]">Activity</Link>
            <a href="#funding-partners" className="block rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.05]">Funding partners</a>
          </div>
          <div className="mt-3 rounded-xl border border-gray-200 p-3 dark:border-white/10">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Environment</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-gray-100">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {data.environment}
            </p>
            <p className="mt-2 text-[10px] leading-5 text-gray-400">Owned HashPayStream records only.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 rounded-[1.75rem] border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#111216] sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">Overview</p>
               <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">Operations</h1>
               <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Human and agent agreements use separate projects, routes, credentials, and ownership stores.</p>
            </div>
            <button type="button" onClick={() => void load()} className="flex h-10 w-fit items-center gap-2 rounded-full border border-gray-200 px-4 text-xs font-semibold text-gray-600 dark:border-white/10 dark:text-gray-300">
              <ArrowPathIcon className="h-4 w-4" /> Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
             <Metric label="Agreement records" value={String(data.scope.ownedAgreements)} detail={paths.map(([name, count]) => `${name}: ${count}`).join(' / ')} Icon={DocumentTextIcon} />
            <Metric label="Protected test USDC" value={data.testUsdc.protected} detail={`${data.testUsdc.remaining} remaining / ${data.testUsdc.released} released`} Icon={BanknotesIcon} />
            <Metric label="Needs attention" value={String(attention)} detail={`${data.totals.awaitingFunding} funding / ${data.totals.active} active / ${data.totals.refundAvailable} refundable`} Icon={ClockIcon} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white"><ChartBarSquareIcon className="h-4 w-4 text-blue-500" /> Lifecycle</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  ['Awaiting funding', data.totals.awaitingFunding],
                  ['Active', data.totals.active],
                  ['Completed', data.totals.completed],
                  ['Returned', data.totals.cancelled + data.totals.refunded],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-white/[0.04]">
                    <p className="text-[10px] font-medium text-gray-400">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-gray-200 px-3 py-3 text-[11px] leading-5 text-gray-500 dark:border-white/10 dark:text-gray-400">
                <b className="text-gray-800 dark:text-gray-100">{data.performance.fundedCompletionRate ?? 0}%</b> funded completion / review {duration(data.performance.averageDeliveryReviewHours)} / funding {duration(data.performance.averageFundingHours)}
              </div>
            </article>

            <article className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white"><CpuChipIcon className="h-4 w-4 text-blue-500" /> Connected services</h2>
              <div className="mt-4 space-y-2">
                {sources.map(([label, latency]) => (
                  <div key={label} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 dark:bg-white/[0.04]">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300"><CheckCircleIcon className="h-3.5 w-3.5" /> {latency}ms</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-5 text-gray-500 dark:text-gray-400">Latest lifecycle event: {when(data.infrastructure.latestLifecycleAt)}</p>
            </article>
          </div>

          <FundingPartnerReviewPanel />

          <p className="mt-5 text-center text-[10px] leading-5 text-gray-400">{data.privacy}</p>
        </main>
      </div>
    </section>
  )
}
