import {
  ArrowRightIcon,
  ArrowDownTrayIcon,
  BellIcon,
  PaperAirplaneIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  BanknotesIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  SparklesIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { useMemo } from 'react'
import { Link } from '../lib/router'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { formatUsdc, useAgreements } from '../lib/useAgreements'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import { useCircleWallet } from '../lib/circleWallet'
import { useServiceRequests } from '../lib/serviceRequests'
import { buildStreamNotices, useNotificationReadState } from '../lib/streamNotifications'

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
} as const

function activityDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

export default function StreamPayHome() {
  const { ready, authenticated, agreements, totals, loading, error } = useAgreements()
  const wallet = useCircleWallet()
  const requests = useServiceRequests()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const createTo = useStreamPayPath('/requests?compose=1')
  const upfrontTo = useStreamPayPath('/upfront')
  const activityTo = useStreamPayPath('/activity')
  const notificationsTo = useStreamPayPath('/notifications')
  const sendTo = useStreamPayPath('/send')
  const receiveTo = useStreamPayPath('/receive')
  const recentActivity = useMemo(() => agreements.flatMap(agreement => [
    ...(Array.isArray(agreement.timeline) ? agreement.timeline : []).map(event => ({
      id: `${agreement.id}:${event.id}`,
      event: event.event,
      occurredAt: event.createdAt || event.receivedAt,
      title: agreement.title,
    })),
    ...(Array.isArray(agreement.deliveryTimeline) ? agreement.deliveryTimeline : []).map(event => ({
      id: `${agreement.id}:${event.id}`,
      event: event.event,
      occurredAt: event.createdAt,
      title: agreement.title,
    })),
  ])
    .filter(item => item.occurredAt)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 3), [agreements])
  const notices = useMemo(() => buildStreamNotices(agreements, requests.requests), [agreements, requests.requests])
  const { unreadCount } = useNotificationReadState(notices)

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading) return <StreamPayLoadingState active="home" />

  const actions = [
    { label: 'New', Icon: DocumentPlusIcon, to: createTo },
    { label: 'Early pay', Icon: SparklesIcon, to: upfrontTo },
    { label: 'Send', Icon: PaperAirplaneIcon, to: sendTo },
    { label: 'Deposit', Icon: ArrowDownTrayIcon, to: receiveTo },
  ]

  return (
    <section className="w-full max-w-md space-y-4 py-5 sm:py-8">
      <h1 className="sr-only">Agreements</h1>
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</div>}

      <section className="overflow-hidden rounded-[26px] bg-gray-950 px-5 py-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:bg-white dark:text-gray-950">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 dark:text-gray-500">Protected balance</p>
            <p className="mt-1.5 min-w-0 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight">
              {formatUsdc(totals.activeProtected).replace(/ USDC$/, '')} <span className="text-xs font-medium tracking-normal opacity-50">USDC</span>
            </p>
          </div>
          <Link to={notificationsTo} aria-label={unreadCount ? `Open notifications, ${unreadCount} unread` : 'Open notifications'} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75 transition active:scale-95 dark:bg-gray-950/[0.07] dark:text-gray-600"><BellIcon className="h-5 w-5" />{unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-gray-950 dark:ring-white" />}</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 dark:border-gray-950/10">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40 dark:text-gray-500">Available</p>
            <p className="mt-1 text-xs font-bold tabular-nums">{wallet.loadingBalance ? '—' : wallet.balance} <span className="font-medium opacity-50">USDC</span></p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40 dark:text-gray-500">Refund available</p>
            <p className="mt-1 text-xs font-bold tabular-nums">{formatUsdc(totals.refundAvailable)}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-2">
        {actions.map(({ label, Icon, to }) => (
          <Link key={label} to={to} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-1 text-[10px] font-bold text-gray-700 shadow-sm transition active:scale-[0.98] dark:border-white/[0.07] dark:bg-white/[0.035] dark:text-gray-200">
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </section>

      <section className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-gray-950 dark:text-white">Recent activity</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">Your latest agreement updates</p>
          </div>
          <Link to={activityTo} className="flex items-center gap-1 text-[11px] font-bold text-gray-500">
            View all
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-4 space-y-1">
          {recentActivity.map(item => {
            const presentation = EVENT_PRESENTATION[item.event as keyof typeof EVENT_PRESENTATION]
            const Icon = presentation?.Icon ?? ClockIcon
            return (
              <Link key={item.id} to={activityTo} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.07] ${presentation?.tone ?? 'text-gray-500 dark:text-gray-400'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-gray-900 dark:text-white">{presentation?.label ?? 'Agreement updated'}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-gray-400">{item.title || 'Untitled agreement'}</span>
                </span>
                <time dateTime={item.occurredAt} className="shrink-0 text-[10px] font-semibold text-gray-400">{activityDate(item.occurredAt)}</time>
              </Link>
            )
          })}
          {recentActivity.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-xs font-medium text-gray-400">Your confirmed agreement activity will appear here.</p>
              <Link to={createTo} className="mt-3 inline-flex text-xs font-bold text-blue-600 dark:text-blue-400">Create your first agreement</Link>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}
