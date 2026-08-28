import {
  ArrowRightIcon,
  BellIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  DocumentPlusIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { useMemo } from 'react'
import { Link } from '../lib/router'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { formatUsdcBalance, useAgreements } from '../lib/useAgreements'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import { useCircleWallet } from '../lib/circleWallet'
import { useServiceRequests } from '../lib/serviceRequests'
import { buildStreamNotices, useNotificationReadState } from '../lib/streamNotifications'

function activityDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function safeUnits(value: unknown) {
  const units = String(value ?? '').trim()
  return /^\d+$/.test(units) ? BigInt(units) : 0n
}

function decimalUsdcUnits(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/)
  if (!match) return 0n
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'))
}

export default function StreamPayHome() {
  const { ready, authenticated, agreements, loading, error } = useAgreements()
  const wallet = useCircleWallet()
  const requests = useServiceRequests()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const createTo = useStreamPayPath('/requests?compose=1')
  const upfrontTo = useStreamPayPath('/upfront')
  const activityTo = useStreamPayPath('/activity')
  const notificationsTo = useStreamPayPath('/notifications')
  const moveTo = useStreamPayPath('/move')
  const earnTo = useStreamPayPath('/funding')
  const notices = useMemo(() => buildStreamNotices(agreements, requests.requests), [agreements, requests.requests])
  const recentActivity = useMemo(() => notices.slice(0, 3), [notices])
  const { unreadCount } = useNotificationReadState(notices)
  const customerEscrow = useMemo(() => requests.requests.reduce((total, request) => {
    if (request.role !== 'customer' || !request.agreementId || !['funded', 'expired'].includes(request.status)) return total
    const terms = request.terms.find(item => item.version === request.activeVersion)
    const amount = safeUnits(terms?.amountUsdcUnits)
    if (request.status === 'funded') total.protected += amount
    if (request.status === 'expired') total.refundable += amount
    return total
  }, { protected: 0n, refundable: 0n }), [requests.requests])
  const availableBalance = decimalUsdcUnits(wallet.balance)
  const totalBalance = availableBalance + customerEscrow.protected + customerEscrow.refundable

  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (!ready || loading || (!wallet.balanceReady && !wallet.balanceError)) return <StreamPayLoadingState active="home" />

  const actions = [
    { label: 'New', Icon: DocumentPlusIcon, to: createTo },
    { label: 'Early pay', Icon: SparklesIcon, to: upfrontTo },
    { label: 'Move', Icon: ArrowsRightLeftIcon, to: moveTo },
    { label: 'Earn', Icon: BanknotesIcon, to: earnTo },
  ]

  return (
    <section className="stream-screen w-full max-w-md space-y-4 py-5 sm:py-8">
      <h1 className="sr-only">Agreements</h1>
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</div>}

      <section className="overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-950 px-5 py-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:border-[#262626] dark:bg-[#121212]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 dark:text-gray-500">Total balance</p>
            <p className="mt-1.5 min-w-0 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight">
              {!wallet.balanceReady ? 'â€”' : formatUsdcBalance(totalBalance).replace(/ USDC$/, '')} <span className="text-xs font-medium tracking-normal opacity-50">USDC</span>
            </p>
          </div>
          <Link to={notificationsTo} aria-label={unreadCount ? `Open notifications, ${unreadCount} unread` : 'Open notifications'} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75 transition active:scale-95"><BellIcon className="h-5 w-5" />{unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-zinc-950" />}</Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40 dark:text-gray-500">Available</p>
            <p className="mt-1 text-xs font-bold tabular-nums">{!wallet.balanceReady ? 'â€”' : formatUsdcBalance(availableBalance)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40 dark:text-gray-500">Protected</p>
            <p className="mt-1 text-xs font-bold tabular-nums">{formatUsdcBalance(customerEscrow.protected)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40 dark:text-gray-500">Refundable</p>
            <p className="mt-1 text-xs font-bold tabular-nums">{formatUsdcBalance(customerEscrow.refundable)}</p>
          </div>
        </div>
        {wallet.balanceError && !wallet.balanceReady && <button type="button" onClick={() => void wallet.refreshBalance()} className="mt-3 text-[10px] font-bold text-white/65 underline underline-offset-2 dark:text-gray-500">Balance unavailable. Tap to retry.</button>}
      </section>

      <section className="grid grid-cols-4 gap-2">
        {actions.map(({ label, Icon, to }) => (
          <Link key={label} to={to} className="stream-card flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl px-1 text-[10px] font-bold text-gray-700 transition active:scale-[0.98] dark:text-gray-200">
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </section>

      <section className="stream-card p-4">
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
            const Icon = item.Icon
            return (
              <Link key={item.id} to={activityTo} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.07] ${item.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-gray-900 dark:text-white">{item.title}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-gray-400">{item.detail}</span>
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
