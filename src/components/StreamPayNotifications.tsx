import { ArrowLeftIcon, BellIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo } from 'react'
import { Link } from '../lib/router'
import { useAgreements } from '../lib/useAgreements'
import { useServiceRequests } from '../lib/serviceRequests'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import { buildStreamNotices, useNotificationReadState } from '../lib/streamNotifications'

function time(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(parsed)
}

export default function StreamPayNotifications() {
  const agreements = useAgreements()
  const requests = useServiceRequests()
  const homeTo = useStreamPayPath('/home')
  const notices = useMemo(() => buildStreamNotices(agreements.agreements, requests.requests), [agreements.agreements, requests.requests])
  const { markAllRead } = useNotificationReadState(notices)
  useEffect(() => {
    if (!agreements.loading && !requests.loading) markAllRead()
  }, [agreements.loading, markAllRead, requests.loading])

  if (agreements.loading || requests.loading) return <StreamPayLoadingState active="requests" />
  return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3"><Link to={homeTo} className="stream-icon-button" aria-label="Back home"><ArrowLeftIcon className="h-4 w-4" /></Link><h1 className="text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">Notifications</h1></div>
    {(agreements.error || requests.error) && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{agreements.error || requests.error}</p>}
    <div className="stream-list-card mt-5">
      {notices.map((item, index) => <div key={item.id} className={`flex min-h-[72px] items-center gap-3 px-4 py-3 ${index ? 'border-t border-gray-100 dark:border-white/[0.07]' : ''}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] ${item.tone}`}><item.Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">{item.role}</span><span className="mt-1 block truncate text-xs font-bold text-gray-950 dark:text-white">{item.title}</span><span className="mt-0.5 block truncate text-[10px] text-gray-400">{item.detail}</span></span><time className="max-w-16 text-right text-[9px] font-semibold leading-4 text-gray-400">{time(item.occurredAt)}</time></div>)}
      {!notices.length && <div className="px-6 py-14 text-center"><BellIcon className="mx-auto h-6 w-6 text-gray-300" /><p className="mt-3 text-sm font-semibold text-gray-500">No notifications yet</p></div>}
    </div>
  </section>
}
