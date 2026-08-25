import { useState } from 'react'
import { BriefcaseIcon, CheckCircleIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useCustomerRequests, type CustomerRequest } from '../lib/customerRequests'
import { formatUsdc } from '../lib/useAgreements'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'

const CHECKOUT_ORIGIN = String(import.meta.env.VITE_HASH_PAYLINK_BASE_URL || 'https://app.hashpaylink.com').replace(/\/$/, '')
type Tab = 'review' | 'history'

export default function StreamPayRequests() {
  const inbox = useCustomerRequests()
  const [tab, setTab] = useState<Tab>('review')
  const [declining, setDeclining] = useState('')
  const visible = inbox.requests.filter(item => tab === 'review' ? item.decision === 'to_review' : item.decision !== 'to_review')
  if (inbox.loading) return <StreamPayLoadingState active="requests" />
  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-white/[0.06]">{([{ key: 'review', label: 'To review' }, { key: 'history', label: 'History' }] as const).map(item => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`min-h-11 rounded-full text-xs font-extrabold transition ${tab === item.key ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 dark:text-gray-400'}`}>{item.label}{item.key === 'review' && inbox.requests.some(value => value.decision === 'to_review') ? <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] text-white">{inbox.requests.filter(value => value.decision === 'to_review').length}</span> : null}</button>)}</div>
    {inbox.error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{inbox.error}</p>}
    <div className="mt-4 space-y-3">{visible.map(item => <RequestCard key={item.id} item={item} declining={declining === item.id} onDecline={async () => { setDeclining(item.id); try { await inbox.decline(item.id) } finally { setDeclining('') } }} />)}</div>
    {!visible.length && <div className="flex min-h-[50vh] flex-col items-center justify-center px-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm dark:bg-white/[0.06]"><BriefcaseIcon className="h-6 w-6" /></span><p className="mt-4 text-sm font-extrabold text-gray-950 dark:text-white">{tab === 'review' ? 'No job requests to review' : 'No request history yet'}</p><p className="mt-1 text-xs leading-5 text-gray-400">{tab === 'review' ? 'New requests from workers will appear here.' : 'Accepted and declined requests will appear here.'}</p></div>}
  </section>
}

function RequestCard({ item, declining, onDecline }: { item: CustomerRequest; declining: boolean; onDecline: () => Promise<void> }) {
  const reviewing = item.decision === 'to_review'
  const Icon = item.decision === 'accepted' ? CheckCircleIcon : item.decision === 'declined' ? XMarkIcon : ClockIcon
  return <article className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-600 dark:bg-blue-400/10">Worker request</span>{item.earlyPay && <span className="text-[9px] font-black uppercase tracking-wide text-gray-400">Early pay</span>}</div><h2 className="mt-2 truncate text-sm font-extrabold text-gray-950 dark:text-white">{item.title}</h2><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-400">{item.description}</p></div><p className="shrink-0 text-sm font-black tabular-nums">{formatUsdc(item.amountUsdcUnits)}</p></div>
    {reviewing ? <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><a href={`${CHECKOUT_ORIGIN}${item.payerReviewPath}`} className="flex min-h-11 items-center justify-center rounded-full bg-gray-950 px-4 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Review and fund</a><button type="button" disabled={declining} onClick={() => void onDecline()} className="min-h-11 rounded-full px-4 text-xs font-bold text-gray-500 disabled:opacity-40">{declining ? 'Declining…' : 'Decline'}</button></div> : <p className="mt-4 text-[11px] font-bold capitalize text-gray-400">{item.decision}</p>}
  </article>
}
