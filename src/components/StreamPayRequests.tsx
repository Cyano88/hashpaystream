import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeftIcon, BriefcaseIcon, ClockIcon, PlusIcon } from '@heroicons/react/24/outline'
import { formatUsdc } from '../lib/useAgreements'
import { useServiceRequests, type ServiceRequest } from '../lib/serviceRequests'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import { StreamSelect } from './ui/StreamSelect'

const CHECKOUT_ORIGIN = String(import.meta.env.VITE_HASH_PAYLINK_BASE_URL || 'https://app.hashpaylink.com').replace(/\/$/, '')
type Tab = 'received' | 'sent'
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-950 outline-none focus:border-gray-500 dark:border-white/10 dark:bg-[#111113] dark:text-white dark:focus:border-white/30'
function newKey() { return `request:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}` }

export default function StreamPayRequests() {
  const inbox = useServiceRequests()
  const [tab, setTab] = useState<Tab>('received')
  const [creating, setCreating] = useState(false)
  const [countering, setCountering] = useState<ServiceRequest | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const visible = useMemo(() => inbox.requests.filter(item => item.direction === tab), [inbox.requests, tab])
  async function act(item: ServiceRequest, action: string, extra: Record<string, unknown> = {}) {
    setBusy(item.id); setError('')
    try { await inbox.act({ action, requestId: item.id, version: item.activeVersion, ...extra }); setCountering(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The request could not be updated.') }
    finally { setBusy('') }
  }
  if (inbox.loading) return <StreamPayLoadingState active="requests" />
  if (creating) return <CreateRequest onBack={() => setCreating(false)} onCreate={async payload => { await inbox.act({ action: 'create', ...payload }, newKey()); setCreating(false); setTab('sent') }} />
  if (countering) return <CounterRequest item={countering} busy={Boolean(busy)} error={error} onBack={() => setCountering(null)} onSubmit={payload => act(countering, 'provider_counter', payload)} />
  const pending = inbox.requests.filter(item => item.direction === 'received' && ['sent', 'countered'].includes(item.status)).length
  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-white/[0.06]">{(['received', 'sent'] as const).map(value => <button key={value} onClick={() => setTab(value)} className={`min-h-11 rounded-full text-xs font-extrabold capitalize ${tab === value ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 dark:text-gray-400'}`}>{value}{value === 'received' && pending > 0 && <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] text-white">{pending}</span>}</button>)}</div>
    {tab === 'sent' && <button onClick={() => setCreating(true)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-bold text-white dark:bg-white dark:text-gray-950"><PlusIcon className="h-4 w-4" />New request</button>}
    {(inbox.error || error) && <ErrorMessage>{inbox.error || error}</ErrorMessage>}
    <div className="mt-4 space-y-3">{visible.map(item => <RequestCard key={item.id} item={item} busy={busy === item.id} onAction={(action, extra) => act(item, action, extra)} onCounter={() => { setError(''); setCountering(item) }} />)}</div>
    {!visible.length && <div className="flex min-h-[46vh] flex-col items-center justify-center px-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm dark:bg-white/[0.06]"><BriefcaseIcon className="h-6 w-6" /></span><p className="mt-4 text-sm font-extrabold text-gray-950 dark:text-white">No requests {tab}</p><p className="mt-1 text-xs leading-5 text-gray-400">{tab === 'received' ? 'Private offers sent to your email appear here.' : 'Create a private offer for a provider you already know.'}</p></div>}
  </section>
}

function RequestCard({ item, busy, onAction, onCounter }: { item: ServiceRequest; busy: boolean; onAction: (action: string, extra?: Record<string, unknown>) => Promise<void>; onCounter: () => void }) {
  const terms = item.terms.find(value => value.version === item.activeVersion) ?? item.terms[item.terms.length - 1]
  const providerCanRespond = item.role === 'provider' && ['sent', 'countered'].includes(item.status)
  const customerCanAccept = item.role === 'customer' && ['countered', 'provider_accepted'].includes(item.status)
  return <article className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300"><ClockIcon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5"><span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-600 dark:bg-blue-400/10">{item.role === 'customer' ? 'Provider' : 'Customer'}</span>{terms.upfrontRequested && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">Early pay</span>}</div><h2 className="mt-2 truncate text-sm font-extrabold text-gray-950 dark:text-white">{terms.title}</h2><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-400">{terms.description}</p></div><p className="shrink-0 text-sm font-black">{formatUsdc(terms.amountUsdcUnits)}</p></div>
    {terms.upfrontReason && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">{terms.upfrontReason}</p>}
    <div className="mt-3 flex justify-between text-[10px] font-semibold text-gray-400"><span>Version {terms.version}</span><span>{statusLabel(item.status)}</span></div>
    {providerCanRespond && <div className="mt-4 grid grid-cols-2 gap-2"><button disabled={busy} onClick={() => void onAction('provider_accept')} className="min-h-11 rounded-full bg-gray-950 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">Accept</button><button disabled={busy} onClick={onCounter} className="min-h-11 rounded-full border border-gray-200 text-xs font-bold dark:border-white/10">Change terms</button><button disabled={busy} onClick={() => void onAction('provider_decline')} className="col-span-2 min-h-10 text-xs font-bold text-gray-400">Decline</button></div>}
    {customerCanAccept && <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><button disabled={busy} onClick={() => void onAction('customer_accept')} className="min-h-11 rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">Accept final terms</button><button disabled={busy} onClick={() => void onAction('customer_cancel')} className="px-3 text-xs font-bold text-gray-400">Cancel</button></div>}
    {item.role === 'customer' && item.status === 'awaiting_funding' && item.payerReviewPath && <a href={`${CHECKOUT_ORIGIN}${item.payerReviewPath}`} className="mt-4 flex min-h-11 items-center justify-center rounded-full bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Review and fund</a>}
  </article>
}

function statusLabel(status: ServiceRequest['status']) { return ({ sent: 'Waiting for provider', countered: 'New terms proposed', provider_accepted: 'Provider accepted', awaiting_funding: 'Ready to fund', funded: 'Funded', declined: 'Declined', cancelled: 'Cancelled' } as const)[status] }

function CreateRequest({ onBack, onCreate }: { onBack: () => void; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [providerEmail, setProviderEmail] = useState(''); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [duration, setDuration] = useState('86400'); const [cancellation, setCancellation] = useState('900'); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await onCreate({ providerEmail, title, description, amount, durationSeconds: Number(duration), cancellationWindowSeconds: Number(cancellation) }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'The request could not be created.') } finally { setBusy(false) } }
  return <FormShell title="New request" onBack={onBack}><form onSubmit={submit} className="space-y-5"><Field label="Provider email"><input type="email" required value={providerEmail} onChange={e => setProviderEmail(e.target.value)} placeholder="provider@example.com" className={inputClass} /></Field><Field label="Job title"><input required minLength={3} maxLength={140} value={title} onChange={e => setTitle(e.target.value)} placeholder="Website design" className={inputClass} /></Field><Field label="What do you need?"><textarea required minLength={10} maxLength={1200} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the work and what counts as complete." className={`${inputClass} resize-none`} /></Field><Field label="Protected amount"><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100.00 USDC" className={inputClass} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Delivery period"><Duration value={duration} onChange={setDuration} /></Field><Field label="Cancellation"><StreamSelect label="Cancellation" value={cancellation} onChange={setCancellation} options={[{ value: '0', label: 'None' }, { value: '900', label: '15 minutes' }, { value: '3600', label: '1 hour' }]} /></Field></div>{error && <ErrorMessage>{error}</ErrorMessage>}<button disabled={busy} className="min-h-12 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Sending…' : 'Send private request'}</button></form></FormShell>
}

function CounterRequest({ item, onBack, onSubmit, busy, error }: { item: ServiceRequest; onBack: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void>; busy: boolean; error: string }) {
  const terms = item.terms[item.terms.length - 1]; const [amount, setAmount] = useState(terms.amount); const [duration, setDuration] = useState(String(terms.durationSeconds)); const [upfront, setUpfront] = useState(terms.upfrontRequested); const [reason, setReason] = useState(terms.upfrontReason ?? '')
  return <FormShell title="Change terms" onBack={onBack}><form onSubmit={event => { event.preventDefault(); void onSubmit({ amount, durationSeconds: Number(duration), upfrontRequested: upfront, upfrontReason: reason }) }} className="space-y-5"><div><h2 className="text-sm font-extrabold">{terms.title}</h2><p className="mt-1 text-xs text-gray-400">Your changes become version {terms.version + 1}.</p></div><Field label="Protected amount"><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></Field><Field label="Delivery period"><Duration value={duration} onChange={setDuration} /></Field><label className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]"><span><span className="block text-xs font-bold">Request early pay</span><span className="text-[10px] text-gray-400">Subject to risk assessment</span></span><input type="checkbox" checked={upfront} onChange={e => setUpfront(e.target.checked)} className="h-5 w-5 accent-gray-950" /></label>{upfront && <Field label="Why do you need it?"><textarea required minLength={10} maxLength={300} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Materials or costs needed to start." className={`${inputClass} resize-none`} /></Field>}{error && <ErrorMessage>{error}</ErrorMessage>}<button disabled={busy} className="min-h-12 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Sending…' : 'Send new terms'}</button></form></FormShell>
}

function Duration({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <StreamSelect label="Delivery period" value={value} onChange={onChange} options={[{ value: '86400', label: '1 day' }, { value: '259200', label: '3 days' }, { value: '604800', label: '7 days' }, { value: '2592000', label: '30 days' }]} /> }
function FormShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) { return <section className="w-full max-w-md py-5 sm:py-8"><div className="flex items-center gap-3"><button onClick={onBack} aria-label="Back to requests" className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/[0.06]"><ArrowLeftIcon className="h-4 w-4" /></button><h1 className="text-xl font-extrabold">{title}</h1></div><div className="mt-5 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">{children}</div></section> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>{children}</label> }
function ErrorMessage({ children }: { children: ReactNode }) { return <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{children}</p> }
