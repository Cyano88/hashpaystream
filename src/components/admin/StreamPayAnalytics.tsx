import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowPathIcon, BanknotesIcon, ChartBarIcon, CheckCircleIcon, ClockIcon, CpuChipIcon, LockClosedIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import { useHashPayStreamSessionSplash } from '../../lib/useHashPayStreamSessionSplash'
import { AgreementSignInLanding } from '../agreements/AgreementSignInLanding'

const API = '/api/hashpaystream/v1/admin/analytics'
type Analytics = {
  generatedAt: string; environment: string; scope: { limitPerProject: number }
  totals: Record<'agreements' | 'completed', number>; modes: { human: number; agentic: number }
  funnel: Record<'created' | 'funded' | 'deliverySubmitted' | 'releaseApproved' | 'completed', number>
  structures: Array<{ template: string; count: number }>
  testUsdc: { protected: string; remaining: string }
  performance: { fundedCompletionRate: number | null; averageFundingHours: number | null; averageDeliveryReviewHours: number | null }
  daily: Array<{ date: string; created: number; completed: number }>
  infrastructure: { hashPayLink: Record<'human' | 'agentic', { latencyMs: number }>; latestLifecycleAt: string | null }
  circleMarketplace: { note: string }; privacy: string
}
type ApiResponse = { ok?: boolean; analytics?: Analytics; error?: string }

function when(value: string | null) {
  if (!value) return 'No lifecycle event yet'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
function duration(value: number | null) { return value === null ? 'Not enough data' : `${value}h` }
function Card({ label, value, detail, Icon }: { label: string; value: string; detail: string; Icon: typeof ChartBarIcon }) {
  return <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]'>
    <div className='flex items-center justify-between'><p className='text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400'>{label}</p><Icon className='h-4 w-4 text-blue-500' /></div>
    <p className='mt-4 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white'>{value}</p><p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>{detail}</p>
  </article>
}

export default function StreamPayAnalytics() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [data, setData] = useState<Analytics>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const load = useCallback(async () => {
    if (!authenticated) return setLoading(false)
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to view analytics.')
      const response = await fetch(API, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const result = await response.json().catch(() => undefined) as ApiResponse | undefined
      if (!response.ok || !result?.ok || !result.analytics) throw new Error(result?.error || 'Analytics could not be loaded.')
      setData(result.analytics)
      setError('')
    } catch (reason) {
      setData(undefined)
      setError(reason instanceof Error ? reason.message : 'Analytics could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])
  useEffect(() => { if (ready) void load() }, [load, ready])
  const maximum = useMemo(() => Math.max(1, ...(data?.daily.flatMap(item => [item.created, item.completed]) ?? [1])), [data])
  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) return <section className='flex min-h-[58vh] items-center'><ArrowPathIcon className='h-5 w-5 animate-spin text-gray-300' /></section>
  if (!data) return <section className='w-full max-w-3xl py-12'><div className='rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-[#18181b]'>
    <LockClosedIcon className='mx-auto h-7 w-7 text-gray-400' />
    <h1 className='mt-4 text-xl font-semibold text-gray-950 dark:text-white'>Private analytics</h1>
    <p className='mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400'>{error}</p>
    <button type='button' onClick={() => void load()} className='mt-6 rounded-full bg-gray-950 px-4 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950'>Try again</button>
  </div></section>
  const funnel = [['Created', data.funnel.created], ['Funded', data.funnel.funded], ['Delivery submitted', data.funnel.deliverySubmitted], ['Release approved', data.funnel.releaseApproved], ['Completed', data.funnel.completed]] as const
  const labels: Record<string, string> = { fixed_unlock: 'One release', progressive_release: 'Progress releases', milestone: 'Named milestones' }
  return <section className='w-full max-w-5xl py-7 sm:py-12'>
    <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'><div>
      <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400'><LockClosedIcon className='h-3.5 w-3.5' />Private operations</div>
      <h1 className='mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white'>Analytics</h1>
      <p className='mt-2 text-sm text-gray-500 dark:text-gray-400'>Server-derived agreement health across Human and Agentic projects.</p>
    </div><button type='button' onClick={() => void load()} className='flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200'><ArrowPathIcon className='h-4 w-4' />Refresh</button></div>
    <div className='mt-7 flex flex-wrap items-center gap-2 text-[11px]'>
      <span className='rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300'>{data.environment}</span>
      <span className='text-gray-400'>Updated {when(data.generatedAt)}</span><span className='text-gray-300'>/</span><span className='text-gray-400'>Newest {data.scope.limitPerProject} per project</span>
    </div>
    <div className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <Card label='Agreements' value={String(data.totals.agreements)} detail={`${data.modes.human} human / ${data.modes.agentic} agentic`} Icon={Squares2X2Icon} />
      <Card label='Test USDC protected' value={data.testUsdc.protected} detail={`${data.testUsdc.remaining} remaining`} Icon={BanknotesIcon} />
      <Card label='Completed' value={String(data.totals.completed)} detail={`${data.performance.fundedCompletionRate ?? 0}% of funded`} Icon={CheckCircleIcon} />
      <Card label='Review time' value={duration(data.performance.averageDeliveryReviewHours)} detail={`Funding average: ${duration(data.performance.averageFundingHours)}`} Icon={ClockIcon} />
    </div>
    <div className='mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]'>
      <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6'>
        <h2 className='flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white'><ChartBarIcon className='h-4 w-4 text-blue-500' />Agreement funnel</h2>
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>Confirmed Hash PayLink and Arc lifecycle events.</p>
        <div className='mt-6 space-y-4'>{funnel.map(([label, value]) => <div key={label}><div className='flex justify-between text-xs'><span className='font-medium text-gray-600 dark:text-gray-300'>{label}</span><b className='text-gray-950 dark:text-white'>{value}</b></div><div className='mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10'><div className='h-full rounded-full bg-blue-500' style={{ width: `${data.funnel.created ? Math.max(value ? 3 : 0, value / data.funnel.created * 100) : 0}%` }} /></div></div>)}</div>
      </article>
      <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6'>
        <h2 className='flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white'><CpuChipIcon className='h-4 w-4 text-blue-500' />Operational state</h2>
        <div className='mt-5 space-y-4 text-xs'>{(['human', 'agentic'] as const).map(mode => <div key={mode} className='flex items-center justify-between border-b border-gray-100 pb-4 dark:border-white/10'><div><b className='capitalize text-gray-950 dark:text-white'>Hash PayLink / {mode}</b><p className='mt-1 text-gray-400'>Upstream API</p></div><span className='rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'>Reachable / {data.infrastructure.hashPayLink[mode].latencyMs}ms</span></div>)}
          <div><b className='text-gray-950 dark:text-white'>Latest lifecycle event</b><p className='mt-1 text-gray-500 dark:text-gray-400'>{when(data.infrastructure.latestLifecycleAt)}</p></div>
        </div>
      </article>
    </div>
    <div className='mt-4 grid gap-4 lg:grid-cols-2'>
      <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6'>
        <h2 className='text-sm font-semibold text-gray-950 dark:text-white'>Last 14 days</h2>
        <div className='mt-6 flex h-36 items-end gap-1.5' aria-label='Created and completed agreements'>{data.daily.map(item => <div key={item.date} className='flex h-full min-w-0 flex-1 items-end gap-px' title={`${item.date}: ${item.created} created, ${item.completed} completed`}><div className='w-1/2 rounded-t bg-blue-200 dark:bg-blue-400/30' style={{ height: `${Math.max(item.created ? 5 : 1, item.created / maximum * 100)}%` }} /><div className='w-1/2 rounded-t bg-blue-600' style={{ height: `${Math.max(item.completed ? 5 : 1, item.completed / maximum * 100)}%` }} /></div>)}</div>
        <p className='mt-4 text-[10px] text-gray-400'>Light: created / Blue: completed</p>
      </article>
      <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6'>
        <h2 className='text-sm font-semibold text-gray-950 dark:text-white'>Release structures</h2>
        <div className='mt-5 space-y-3'>{data.structures.map(item => <div key={item.template} className='flex justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]'><span className='text-xs font-medium text-gray-600 dark:text-gray-300'>{labels[item.template] ?? item.template}</span><b className='text-sm text-gray-950 dark:text-white'>{item.count}</b></div>)}</div>
        <div className='mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'><b>Circle Marketplace:</b> {data.circleMarketplace.note}</div>
      </article>
    </div>
    <p className='mt-5 text-center text-[11px] leading-5 text-gray-400'>{data.privacy}</p>
  </section>
}
