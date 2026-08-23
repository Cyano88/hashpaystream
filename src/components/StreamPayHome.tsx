import { ArrowRightIcon, ChevronDownIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Link } from '../lib/router'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { formatUsdc, useAgreements } from '../lib/useAgreements'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
import { LoadingRing } from './ui/LoadingRing'

const STATUS_LABEL = {
  awaiting_start: 'Waiting for funding',
  active: 'Active',
  expired: 'Refund available',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
} as const

export default function StreamPayHome() {
  const { ready, authenticated, agreements, totals, loading, error } = useAgreements()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const agreementsTo = useStreamPayPath('/agreements')
  const createTo = useStreamPayPath('/agreements/new')
  const [openAgreementId, setOpenAgreementId] = useState('')

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) return <section className="flex min-h-[58vh] items-center"><LoadingRing className="h-5 w-5 text-gray-300" /></section>

  return (
    <section className="w-full max-w-5xl py-7 sm:py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Overview</p>
            <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">Arc test network</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Your agreements</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Protected, released, and refundable USDC in one place.</p>
        </div>
        <Link to={createTo} aria-label="Create agreement" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950 sm:hidden">
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</div>}

      {!error && <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:items-start">
        <div>
          <div className="overflow-hidden rounded-3xl bg-gray-950 p-5 text-white shadow-[0_22px_60px_-36px_rgba(15,23,42,.8)] dark:bg-white dark:text-gray-950 sm:p-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 dark:text-gray-500">Currently protected</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{formatUsdc(totals.activeProtected)}</p>
            <div className="mt-7 grid grid-cols-2 gap-4 border-t border-white/15 pt-5 dark:border-gray-200">
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/50 dark:text-gray-500">Released to date</p><p className="mt-1 text-sm font-semibold">{formatUsdc(totals.released)}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/50 dark:text-gray-500">Refund available</p><p className="mt-1 text-sm font-semibold">{formatUsdc(totals.refundAvailable)}</p></div>
            </div>
          </div>
          <Link to={createTo} className="mt-3 hidden w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-900 transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-[#18181b] dark:text-white dark:hover:border-white/20 sm:flex">
            <PlusIcon className="h-4 w-4" />
            New agreement
          </Link>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Recent agreements</h2>
            <Link to={agreementsTo} className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">View all <ArrowRightIcon className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="mt-3 space-y-2">
            {agreements.slice(0, 3).map(agreement => (
            <div key={agreement.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#18181b]">
              <button
                type="button"
                aria-expanded={openAgreementId === agreement.id}
                onClick={() => setOpenAgreementId(current => current === agreement.id ? '' : agreement.id)}
                className="flex w-full items-center justify-between gap-4 p-4 text-left"
              >
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-950 dark:text-white">{agreement.title || 'Untitled agreement'}</p><p className="mt-1 text-xs text-gray-400">{STATUS_LABEL[agreement.status]}</p></div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{agreement.chain ? formatUsdc(agreement.chain.amountUsdcUnits) : `${agreement.amount || '0'} USDC`}</p>
                  <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform ${openAgreementId === agreement.id ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {openAgreementId === agreement.id && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-white/10">
                  {agreement.description && <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{agreement.description}</p>}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400">Released</p><p className="mt-1 text-xs font-semibold text-gray-900 dark:text-white">{formatUsdc(agreement.chain?.releasedUsdcUnits || '0')}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400">Remaining</p><p className="mt-1 text-xs font-semibold text-gray-900 dark:text-white">{formatUsdc(agreement.chain?.remainingUsdcUnits || '0')}</p></div>
                  </div>
                </div>
              )}
            </div>
            ))}
            {agreements.length === 0 && <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-9 text-center dark:border-white/10"><p className="text-sm font-medium text-gray-700 dark:text-gray-200">No agreements yet</p><Link to={createTo} className="mt-3 inline-flex text-xs font-semibold text-blue-600 dark:text-blue-400">Create your first agreement</Link></div>}
          </div>
        </div>
      </div>}
    </section>
  )
}
