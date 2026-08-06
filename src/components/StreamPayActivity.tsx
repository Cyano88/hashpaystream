import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUpTrayIcon,
  BanknotesIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useMemo, useState } from 'react'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useAgreements } from '../lib/useAgreements'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

const EVENT_PRESENTATION = {
  'agreement.activated': { label: 'Agreement funded', Icon: BanknotesIcon, tone: 'text-emerald-600 dark:text-emerald-400' },
  'agreement.step_released': { label: 'Release confirmed', Icon: CheckBadgeIcon, tone: 'text-blue-600 dark:text-blue-400' },
  'agreement.expired': { label: 'Refund available', Icon: ClockIcon, tone: 'text-amber-600 dark:text-amber-400' },
  'agreement.completed': { label: 'Agreement completed', Icon: CheckCircleIcon, tone: 'text-emerald-600 dark:text-emerald-400' },
  'agreement.cancelled': { label: 'Agreement cancelled', Icon: XCircleIcon, tone: 'text-gray-500 dark:text-gray-400' },
  'agreement.refunded': { label: 'Remaining USDC returned', Icon: ArrowUturnLeftIcon, tone: 'text-amber-600 dark:text-amber-400' },
  'delivery.submitted': { label: 'Delivery submitted', Icon: ArrowUpTrayIcon, tone: 'text-blue-600 dark:text-blue-400' },
  'delivery.updated': { label: 'Delivery updated', Icon: PencilSquareIcon, tone: 'text-blue-600 dark:text-blue-400' },
  'delivery.issue_reported': { label: 'Issue reported', Icon: ExclamationTriangleIcon, tone: 'text-red-600 dark:text-red-400' },
  'delivery.release_approved': { label: 'Release approved', Icon: CheckBadgeIcon, tone: 'text-blue-600 dark:text-blue-400' },
}

function eventDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function eventTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date)
}

export default function StreamPayActivity() {
  const { ready, authenticated, agreements, loading, error } = useAgreements()
  const [showAll, setShowAll] = useState(false)
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const activity = useMemo(() => agreements.flatMap(agreement => [
    ...(agreement.timeline ?? []).map(event => ({ id: `${agreement.id}:${event.id}`, event: event.event, occurredAt: event.createdAt || event.receivedAt, title: agreement.title })),
    ...(agreement.deliveryTimeline ?? []).map(event => ({ id: `${agreement.id}:${event.id}`, event: event.event, occurredAt: event.createdAt, title: agreement.title })),
  ]).filter(item => item.occurredAt).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [agreements])
  const visibleActivity = showAll ? activity : activity.slice(0, 10)

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) return <section className="flex min-h-[58vh] items-center"><ArrowPathIcon className="h-5 w-5 animate-spin text-gray-300" /></section>

  return (
    <section className="w-full max-w-3xl py-7 sm:py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">History</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Activity</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Confirmed agreement and delivery updates.</p>
      {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</div>}
      {!error && <div className="mt-7 overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#18181b]">
        {visibleActivity.map((item, index) => {
          const presentation = EVENT_PRESENTATION[item.event as keyof typeof EVENT_PRESENTATION]
          const Icon = presentation?.Icon ?? ClockIcon
          const date = eventDate(item.occurredAt)
          const previousDate = index ? eventDate(visibleActivity[index - 1].occurredAt) : ''
          return <Fragment key={item.id}>
            {date !== previousDate && <p className={`${index ? 'border-t border-gray-100 dark:border-white/10' : ''} bg-gray-50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:bg-white/[0.025] sm:px-5`}>{date}</p>}
            <div className="flex min-h-16 items-center gap-3 border-t border-gray-100 px-4 py-3 dark:border-white/10 sm:px-5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${presentation?.tone ?? 'text-gray-500 dark:text-gray-400'}`}><Icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-950 dark:text-white">{presentation?.label ?? 'Agreement updated'}</p>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{item.title || 'Untitled agreement'}</p>
              </div>
              <time dateTime={item.occurredAt} className="shrink-0 text-[11px] text-gray-400">{eventTime(item.occurredAt)}</time>
            </div>
          </Fragment>
        })}
        {activity.length > 10 && <button type="button" onClick={() => setShowAll(current => !current)} className="w-full border-t border-gray-100 px-5 py-3.5 text-xs font-semibold text-blue-600 dark:border-white/10 dark:text-blue-400">{showAll ? 'Show recent activity' : 'View earlier activity'}</button>}
        {activity.length === 0 && <p className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">Agreement activity will appear here.</p>}
      </div>}
    </section>
  )
}
