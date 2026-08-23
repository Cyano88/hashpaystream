import { useCallback, useEffect, useState } from 'react'
import { ArrowRightIcon, BanknotesIcon, ChartBarIcon, CheckBadgeIcon, CheckCircleIcon, CpuChipIcon, DocumentCheckIcon, ShieldCheckIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { LoadingRing } from './ui/LoadingRing'

const STATS_API = '/api/hashpaystream/v1/public/stats'
type Stats = {
  generatedAt: string
  environment: string
  agreements: { created: number; funded: number; completed: number }
  participation: { human: number; agentic: number }
  testUsdc: { protected: string; released: string }
  structures: Array<{ template: string; count: number }>
  verifiedOperation: { available: boolean; documentationPath: string; explorerNetwork: string }
  methodology: string
  disclaimer: string
  privacy: string
}
type StatsResponse = { ok?: boolean; stats?: Stats; error?: string }

function updated(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently updated' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
function Metric({ label, value, detail, Icon }: { label: string; value: string; detail: string; Icon: typeof ChartBarIcon }) {
  return <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6'>
    <span className='flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'><Icon className='h-5 w-5' /></span>
    <p className='mt-5 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white'>{value}</p>
    <p className='mt-2 text-xs font-semibold text-gray-700 dark:text-gray-200'>{label}</p>
    <p className='mt-1 text-[11px] leading-5 text-gray-400'>{detail}</p>
  </article>
}

const structureLabels: Record<string, string> = { fixed_unlock: 'One release', progressive_release: 'Progress releases', milestone: 'Named milestones' }

export default function StreamPayStats() {
  const [stats, setStats] = useState<Stats>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(STATS_API)
      const result = await response.json().catch(() => undefined) as StatsResponse | undefined
      if (!response.ok || !result?.ok || !result.stats) throw new Error(result?.error || 'Public statistics could not be loaded.')
      setStats(result.stats)
      setError('')
    } catch (reason) {
      setStats(undefined)
      setError(reason instanceof Error ? reason.message : 'Public statistics could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (loading) return <section className='flex min-h-[58vh] items-center'><LoadingRing className='h-5 w-5 text-gray-300' /></section>
  if (!stats) return <section className='w-full max-w-3xl py-12'><div className='rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-[#18181b]'>
    <ChartBarIcon className='mx-auto h-7 w-7 text-gray-400' /><h1 className='mt-4 text-xl font-semibold text-gray-950 dark:text-white'>Product statistics are refreshing</h1>
    <p className='mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400'>{error}</p><button type='button' onClick={() => void load()} className='mt-6 rounded-full bg-gray-950 px-4 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950'>Try again</button>
  </div></section>

  const participationTotal = Math.max(1, stats.participation.human + stats.participation.agentic)
  return <section className='w-full max-w-5xl py-8 sm:py-14'>
    <div className='max-w-3xl'><div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400'><ShieldCheckIcon className='h-4 w-4' />Public product proof</div>
      <h1 className='mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl'>HashPayStream is operating on Arc Testnet.</h1>
      <p className='mt-4 text-sm leading-7 text-gray-500 dark:text-gray-400'>A privacy-safe view of agreement creation, protected test USDC, delivery approval, and confirmed completion across Human and Agentic HashPayStream projects.</p>
    </div>
    <div className='mt-6 flex flex-wrap items-center gap-2 text-[11px]'><span className='rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300'>{stats.environment}</span><span className='text-gray-400'>Updated {updated(stats.generatedAt)}</span></div>

    <div className='mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <Metric label='Agreements created' value={String(stats.agreements.created)} detail='Terms created through Hash PayLink APIs.' Icon={DocumentCheckIcon} />
      <Metric label='Agreements funded' value={String(stats.agreements.funded)} detail='Arc escrow activation observed.' Icon={BanknotesIcon} />
      <Metric label='Agreements completed' value={String(stats.agreements.completed)} detail='Confirmed lifecycle completion.' Icon={CheckCircleIcon} />
      <Metric label='Test USDC protected' value={stats.testUsdc.protected} detail={`${stats.testUsdc.released} test USDC released.`} Icon={CheckBadgeIcon} />
    </div>

    <div className='mt-4 grid gap-4 lg:grid-cols-2'>
      <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6'>
        <h2 className='flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white'><UserGroupIcon className='h-4 w-4 text-blue-500' />People and agents</h2>
        <div className='mt-6 space-y-5'>{(['human', 'agentic'] as const).map(mode => { const count = stats.participation[mode]; return <div key={mode}><div className='flex justify-between text-xs'><span className='font-medium capitalize text-gray-600 dark:text-gray-300'>{mode}</span><b className='text-gray-950 dark:text-white'>{count}</b></div><div className='mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10'><div className='h-full rounded-full bg-blue-500' style={{ width: `${Math.max(count ? 4 : 0, count / participationTotal * 100)}%` }} /></div></div> })}</div>
      </article>
      <article className='rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6'>
        <h2 className='flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white'><CpuChipIcon className='h-4 w-4 text-blue-500' />Release structures</h2>
        <div className='mt-5 space-y-3'>{stats.structures.map(item => <div key={item.template} className='flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]'><span className='text-xs font-medium text-gray-600 dark:text-gray-300'>{structureLabels[item.template] ?? item.template}</span><b className='text-sm text-gray-950 dark:text-white'>{item.count}</b></div>)}</div>
      </article>
    </div>

    {stats.verifiedOperation.available && <Link to={stats.verifiedOperation.documentationPath} className='mt-4 flex flex-col gap-5 rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950 sm:flex-row sm:items-center sm:justify-between sm:p-8'><div><p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400 dark:text-blue-600'>Verified operating example</p><h2 className='mt-2 text-xl font-semibold'>Inspect a completed Arc agreement.</h2><p className='mt-2 text-xs leading-5 text-gray-300 dark:text-gray-600'>Review the documented funding, delivery, payer approval, completion, and explorer confirmation.</p></div><span className='flex shrink-0 items-center gap-2 text-xs font-semibold'>Open proof <ArrowRightIcon className='h-4 w-4' /></span></Link>}

    <div className='mt-5 rounded-2xl border border-gray-200 px-5 py-4 text-[11px] leading-5 text-gray-500 dark:border-white/10 dark:text-gray-400'><p>{stats.methodology}</p><p className='mt-2'>{stats.disclaimer}</p><p className='mt-2'>{stats.privacy}</p></div>
  </section>
}
