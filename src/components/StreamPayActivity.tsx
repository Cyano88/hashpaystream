import { ArrowDownLeftIcon, ArrowUpRightIcon, BanknotesIcon, CheckBadgeIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatUsdc, useAgreements } from '../lib/useAgreements'
import { pendingArcActivity, removeArcActivity } from '../lib/arcTransferActivity'
import { usePocketTransfers, type PocketTransfer } from '../lib/pocketTransfers'
import { useStreamAccount } from '../lib/streamAccount'
import { useServiceRequests } from '../lib/serviceRequests'
import { buildStreamNotices } from '../lib/streamNotifications'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'

const EVENTS = {
  'agreement.activated': { label: 'Agreement funded', Icon: BanknotesIcon, tone: 'text-emerald-600' },
  'agreement.step_released': { label: 'Release confirmed', Icon: CheckBadgeIcon, tone: 'text-blue-600' },
  'agreement.expired': { label: 'Refund available', Icon: ClockIcon, tone: 'text-amber-600' },
  'agreement.completed': { label: 'Agreement completed', Icon: CheckCircleIcon, tone: 'text-emerald-600' },
  'agreement.cancelled': { label: 'Agreement cancelled', Icon: XCircleIcon, tone: 'text-gray-500' },
  'agreement.refunded': { label: 'USDC returned', Icon: ArrowDownLeftIcon, tone: 'text-amber-600' },
  'delivery.submitted': { label: 'Work submitted', Icon: ArrowUpRightIcon, tone: 'text-blue-600' },
  'delivery.updated': { label: 'Work updated', Icon: ArrowUpRightIcon, tone: 'text-blue-600' },
  'delivery.issue_reported': { label: 'Issue reported', Icon: XCircleIcon, tone: 'text-red-600' },
  'delivery.release_approved': { label: 'Release approved', Icon: CheckBadgeIcon, tone: 'text-blue-600' },
} as const

function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed) }
function time(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(parsed) }
function short(value: string) { return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value }

export default function StreamPayActivity() {
  const { ready, authenticated, agreements, loading, error } = useAgreements()
  const account = useStreamAccount(true)
  const transfers = usePocketTransfers()
  const [resumeError, setResumeError] = useState('')
  const [resuming, setResuming] = useState('')
  const requests = useServiceRequests()
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    const owner = account.profile?.walletAddress
    if (!authenticated || !owner) return
    let active = true
    void (async () => {
      try {
        const legacy = window.localStorage.getItem('hashpaystream.pendingArcTransfer')
        const pending = [...new Set([...pendingArcActivity(owner), ...(legacy ? [legacy] : [])])]
        for (const hash of pending) {
          if (!active) return
          try {
            await account.recordTransfer(hash)
            removeArcActivity(owner, hash)
            if (legacy === hash) window.localStorage.removeItem('hashpaystream.pendingArcTransfer')
          } catch { /* Keep this reference for its owner to retry. */ }
        }
        if (active && pending.length) await account.refresh()
      } catch { /* Optional local activity cache cannot prevent Activity loading. */ }
    })()
    return () => { active = false }
  }, [authenticated, account.profile?.walletAddress, account.recordTransfer, account.refresh])
  const requestNotices = useMemo(() => buildStreamNotices([], requests.requests), [requests.requests])
  const activity = useMemo(() => {
    const agreementRows = agreements.flatMap(agreement => [
      ...(agreement.timeline ?? []).map(event => ({ id: `${agreement.id}:${event.id}`, event: event.event, occurredAt: event.createdAt || event.receivedAt, title: agreement.title || 'Agreement', detail: 'Protected payment' })),
      ...(agreement.deliveryTimeline ?? []).map(event => ({ id: `${agreement.id}:${event.id}`, event: event.event, occurredAt: event.createdAt, title: agreement.title || 'Agreement', detail: 'Delivery update' })),
    ])
    const transferRows = account.activity.map(item => ({
      id: item.id, event: item.direction === 'sent' ? 'wallet.sent' : 'wallet.received', occurredAt: item.createdAt,
      title: item.direction === 'sent' ? 'USDC sent' : 'USDC received',
      detail: `${formatUsdc(item.amountUsdcUnits)} · ${item.counterpartyPocketId ? `ID ${item.counterpartyPocketId}` : short(item.counterpartyAddress)}`,
      txHash: item.txHash,
    }))
    const requestRows = requestNotices.map(item => ({ id: item.id, event: 'request.notice', occurredAt: item.occurredAt, title: item.title, detail: item.detail, notice: item }))
    const trackedRows = transfers.rows.filter(row => !row.hash || !account.activity.some(item => item.txHash.toLowerCase() === row.hash?.toLowerCase())).map(row => ({
      id: 'tracked:' + row.id, event: 'wallet.tracked', occurredAt: row.createdAt,
      title: row.status === 'successful' ? 'USDC sent' : row.status === 'failed' ? 'Transfer failed' : row.status === 'awaiting_approval' ? 'Approval unfinished' : row.status === 'needs_review' ? 'Transfer needs review' : 'Transfer processing',
      detail: `${formatUsdc(row.units)} \u00b7 ${short(row.recipient)} \u00b7 ${row.chainId === 196 ? 'X Layer' : 'Arc'}`,
      txHash: row.hash, chainId: row.chainId, pendingTransfer: row,
    }))
    return [...agreementRows, ...requestRows, ...transferRows, ...trackedRows].filter(item => item.occurredAt).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  }, [account.activity, agreements, requestNotices, transfers.rows])
  const visible = showAll ? activity : activity.slice(0, 20)
  if (!authenticated) return <AgreementSignInLanding />
  if (!ready || loading || account.loading || requests.loading) return <StreamPayLoadingState active="agreements" />

  return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <h1 className="sr-only">Activity</h1>
    {(error || account.error || requests.error) && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{error || account.error || requests.error}</p>}
    {(resumeError || transfers.error) && <p role="alert" className="mb-4 text-xs text-red-600">{resumeError || transfers.error}</p>}
    <div className="stream-list-card">
      {visible.map((item, index) => {
        const transfer = item.event === 'wallet.sent' || item.event === 'wallet.received'
        const pendingTransfer = 'pendingTransfer' in item ? item.pendingTransfer as PocketTransfer : undefined
        const notice = 'notice' in item ? item.notice as (typeof requestNotices)[number] : undefined
        const presentation = item.event === 'wallet.tracked' ? { label: item.title, Icon: item.title === 'USDC sent' ? CheckCircleIcon : ClockIcon, tone: 'text-blue-600' } : notice ? { label: notice.title, Icon: notice.Icon, tone: notice.tone } : transfer ? { label: item.title, Icon: item.event === 'wallet.sent' ? ArrowUpRightIcon : ArrowDownLeftIcon, tone: item.event === 'wallet.sent' ? 'text-blue-600' : 'text-emerald-600' } : EVENTS[item.event as keyof typeof EVENTS]
        const Icon = presentation?.Icon ?? ClockIcon
        const group = date(item.occurredAt)
        const previous = index ? date(visible[index - 1].occurredAt) : ''
        const row = <div className="flex min-h-[68px] items-center gap-3 border-t border-gray-100 px-4 py-3 dark:border-white/[0.07]"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] ${presentation?.tone || 'text-gray-500'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-950 dark:text-white">{presentation?.label || 'Updated'}</span><span className="mt-0.5 block truncate text-[11px] text-gray-400">{item.detail || item.title}</span></span><time className="text-[10px] font-semibold text-gray-400">{time(item.occurredAt)}</time></div>
        return <Fragment key={item.id}>{group !== previous && <p className={`${index ? 'border-t border-gray-100 dark:border-white/[0.07]' : ''} bg-gray-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:bg-white/[0.025]`}>{group}</p>}{'txHash' in item && item.txHash ? <a href={`${'chainId' in item && item.chainId === 196 ? 'https://www.oklink.com/xlayer' : 'https://testnet.arcscan.app'}/tx/${item.txHash}`} target="_blank" rel="noreferrer">{row}</a> : <>{row}{pendingTransfer && pendingTransfer.chainId === 5042002 && pendingTransfer.status === 'awaiting_approval' && <button disabled={Boolean(resuming)} onClick={async () => { setResuming(pendingTransfer.id); setResumeError(''); try { await transfers.resume(pendingTransfer) } catch (error) { setResumeError(error instanceof Error ? error.message : 'Approval is unavailable.') } finally { setResuming('') } }} className="px-4 pb-3 text-xs font-bold text-blue-600 disabled:opacity-40">{resuming === pendingTransfer.id ? 'Opening approval...' : 'Resume approval'}</button>}</>}</Fragment>
      })}
      {activity.length > 20 && <button type="button" onClick={() => setShowAll(current => !current)} className="w-full border-t border-gray-100 px-5 py-4 text-xs font-bold text-blue-600 dark:border-white/[0.07]">{showAll ? 'Show recent activity' : 'View earlier activity'}</button>}
      {!activity.length && <p className="px-6 py-14 text-center text-sm leading-6 text-gray-400">Your confirmed activity will appear here.</p>}
    </div>
  </section>
}
