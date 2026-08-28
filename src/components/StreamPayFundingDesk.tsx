import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, BanknotesIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { Link, Navigate } from '../lib/router'
import { upfrontTreasuryEnabled } from '../lib/upfrontChains'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import UpfrontTreasuryWallet from './UpfrontTreasuryWallet'
import UpfrontFundButton from './UpfrontFundButton'
import UpfrontLifecycleButton from './UpfrontLifecycleButton'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'

type Opportunity = {
  id: string
  agreementId: string
  title: string
  protectedUsdcUnits: string
  requestedAdvanceUsdcUnits: string
  maximumAdvanceBps: number
  durationSeconds: number
  providerPayoutAddress: string
  evidenceGrade: string
  confidence: number
  expiresAt: string
  onchainOffer: Record<string, unknown>
  positionId: `0x${string}`
  positionStatus: 'available' | 'funded' | 'released' | 'refunded'
  funder?: string
  repaymentRecipient?: string
}

const API = '/api/hashpaystream/v1/upfront/opportunities'
const XLAYER_MAINNET = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? '1952') === '196'

function usdc(units: string) {
  if (!/^\d+$/.test(units)) return '0 USDC'
  const padded = units.padStart(7, '0')
  return `${padded.slice(0, -6)}.${padded.slice(-6)}`.replace(/0+$/, '').replace(/\.$/, '') + ' USDC'
}

function short(value: string) {
  return value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-5)}` : value
}

function duration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`
  return `${Math.round(seconds / 3600)} hour${seconds === 3600 ? '' : 's'}`
}

function positionLabel(status: Opportunity['positionStatus']) {
  if (status === 'funded') return 'Ready to release'
  if (status === 'released') return 'Awaiting repayment'
  if (status === 'refunded') return 'Refunded'
  return 'Requested'
}

export default function StreamPayFundingDesk() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const earnTo = useStreamPayPath('/funding')
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!authenticated) { setAuthorized(false); setLoading(false); return }
    if (!silent) {
      setLoading(true)
      setAuthorized(false)
      setError('')
    }
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to open funding.')
      const response = await fetch(API, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const body = await response.json().catch(() => ({})) as { opportunities?: Opportunity[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Funding requests could not be loaded.')
      setAuthorized(true)
      setOpportunities(body.opportunities ?? [])
    } catch (reason) {
      if (!silent) setError(reason instanceof Error ? reason.message : 'Funding requests could not be loaded.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (!ready) return
    void load()
    const timer = window.setInterval(() => void load(true), 15_000)
    const visible = () => { if (document.visibilityState === 'visible') void load(true) }
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [load, ready])

  const openOffers = useMemo(() => opportunities.filter(item => item.positionStatus === 'available'), [opportunities])
  const positions = useMemo(() => opportunities.filter(item => item.positionStatus !== 'available'), [opportunities])
  const activePositions = useMemo(() => positions.filter(item => item.positionStatus === 'funded' || item.positionStatus === 'released'), [positions])
  const deployedUnits = useMemo(() => activePositions.reduce((total, item) => total + (/^\d+$/.test(item.requestedAdvanceUsdcUnits) ? BigInt(item.requestedAdvanceUsdcUnits) : 0n), 0n).toString(), [activePositions])
  const selected = opportunities.find(item => item.id === selectedId)

  if (!ready || loading) return <StreamPayLoadingState active="home" />
  if (!authenticated) return <Navigate to={earnTo} replace />

  if (selected) return <FundingDetail item={selected} onBack={() => setSelectedId('')} onUpdated={load} />

  return <section className="stream-screen w-full max-w-md space-y-4 py-5 sm:py-8">
    <div className="flex items-center gap-3">
      <Link to={earnTo} aria-label="Back to Earn" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link>
      <div><h1 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">Funding requests</h1><p className="mt-0.5 text-[11px] text-gray-400">Only requests sent directly to you appear here.</p></div>
    </div>

    {authorized && (upfrontTreasuryEnabled
      ? <UpfrontTreasuryWallet deployedUsdcUnits={deployedUnits} activePositions={activePositions.length} />
      : <div className="stream-card p-4 text-xs text-gray-500">Funding transactions are currently locked.</div>)}

    {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-bold underline">Try again</button></div>}

    {!error && <OpportunitySection title="Incoming requests" count={openOffers.length}>
      {openOffers.length > 0
        ? openOffers.map(item => <OpportunityRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />)
        : <EmptyState title="No funding requests" detail="Private requests sent to you will appear here." />}
    </OpportunitySection>}

    {!error && positions.length > 0 && <OpportunitySection title="Active positions" count={positions.length}>
      {positions.map(item => <OpportunityRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />)}
    </OpportunitySection>}

    <p className="px-1 py-2 text-[9px] leading-4 text-gray-400">{XLAYER_MAINNET ? 'Public test: Arc protection uses test USDC; X Layer advances use real USDC.' : 'Demo mode uses test funds.'}</p>
  </section>
}

function OpportunitySection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section>
    <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-xs font-black text-gray-950 dark:text-white">{title}</h2><span className="text-[10px] font-bold text-gray-400">{count}</span></div>
    <div className="space-y-2">{children}</div>
  </section>
}

function OpportunityRow({ item, onOpen }: { item: Opportunity; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="stream-card flex min-h-[88px] w-full items-center gap-3 p-4 text-left transition active:scale-[0.99]">
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><BanknotesIcon className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-gray-950 dark:text-white">{item.title}</span><span className="mt-1 block text-[10px] font-semibold text-gray-400">{positionLabel(item.positionStatus)} / {duration(item.durationSeconds)}</span></span>
    <span className="shrink-0 text-right"><span className="block text-sm font-black tabular-nums text-gray-950 dark:text-white">{usdc(item.requestedAdvanceUsdcUnits)}</span><span className="mt-1 block text-[9px] text-gray-400">{item.maximumAdvanceBps / 100}% limit</span></span>
    <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" />
  </button>
}

function FundingDetail({ item, onBack, onUpdated }: { item: Opportunity; onBack: () => void; onUpdated: () => Promise<void> | void }) {
  const { getAccessToken } = usePrivy()
  const [declining, setDeclining] = useState(false)
  const [declineError, setDeclineError] = useState('')
  async function decline() {
    setDeclining(true); setDeclineError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to decline this request.')
      const response = await fetch(API, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'decline', requestId: item.id }) })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'This request could not be declined.')
      await Promise.resolve(onUpdated())
      onBack()
    } catch (reason) { setDeclineError(reason instanceof Error ? reason.message : 'This request could not be declined.') }
    finally { setDeclining(false) }
  }
  return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} aria-label="Back to funding" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></button>
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{positionLabel(item.positionStatus)}</p><h1 className="truncate text-xl font-black tracking-tight text-gray-950 dark:text-white">{item.title}</h1></div>
    </div>

    <article className="stream-card mt-5 p-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Metric label="Advance" value={usdc(item.requestedAdvanceUsdcUnits)} />
        <Metric label="Protected" value={usdc(item.protectedUsdcUnits)} />
        <Metric label="Term" value={duration(item.durationSeconds)} />
        <Metric label="AI confidence" value={`${item.confidence}%`} />
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/[0.07]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Service provider</p>
        <p className="mt-1 font-mono text-xs font-bold text-gray-700 dark:text-gray-200">{short(item.providerPayoutAddress)}</p>
        <p className="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{item.evidenceGrade} evidence / AI-approved limit {item.maximumAdvanceBps / 100}%.</p>
        {item.positionStatus === 'available' && <p className="mt-2 text-[10px] text-gray-400">Offer expires {new Date(item.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}
      </div>

      {item.positionStatus === 'available'
        ? <div><UpfrontFundButton opportunity={item} onFunded={onUpdated} /><button type="button" disabled={declining} onClick={() => void decline()} className="mt-2 min-h-10 w-full text-xs font-bold text-gray-400 disabled:opacity-50">{declining ? 'Declining…' : 'Decline request'}</button>{declineError && <p className="mt-2 text-[11px] text-rose-600">{declineError}</p>}</div>
        : <UpfrontLifecycleButton opportunity={{ ...item, positionStatus: item.positionStatus }} onUpdated={onUpdated} />}
    </article>
  </section>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="stream-empty px-5 py-8"><BanknotesIcon className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-3 text-sm font-black text-gray-950 dark:text-white">{title}</p><p className="mt-1 text-[11px] text-gray-400">{detail}</p></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">{label}</p><p className="mt-1 text-sm font-black tabular-nums text-gray-950 dark:text-white">{value}</p></div>
}
