import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, BanknotesIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { Link, Navigate, useLocation, useNavigate } from '../lib/router'
import { upfrontSettlementV3Enabled, upfrontTreasuryEnabled } from '../lib/upfrontChains'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import UpfrontTreasuryWallet from './UpfrontTreasuryWallet'
import UpfrontFundButton from './UpfrontFundButton'
import UpfrontLifecycleButton from './UpfrontLifecycleButton'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'
import { reconcileFundingPositions } from '../lib/stableSnapshots'
import FundingPositionReceipt from './FundingPositionReceipt'

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
  fundingTerms?: {
    quote: {
      funderProfitUsdcUnits: string
      funderRepaymentUsdcUnits: string
      platformFeeUsdcUnits: string
      providerRemainderUsdcUnits: string
      providerTotalUsdcUnits: string
    }
  }
  providerSignature?: string
  positionId: `0x${string}`
  positionStatus: 'available' | 'funded' | 'released' | 'settled' | 'refunded' | 'expired' | 'declined'
  funder?: string
  repaymentRecipient?: string
}

const API = '/api/hashpaystream/v1/upfront/opportunities'
const XLAYER_MAINNET = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? '196') === '196'

const opportunityCache = new Map<string, Opportunity[]>()
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
  if (status === 'settled') return 'Completed'
  if (status === 'refunded') return 'Refunded'
  if (status === 'expired') return 'Expired'
  if (status === 'declined') return 'Declined'
  return 'Requested'
}

export default function StreamPayFundingDesk() {
  const { ready, authenticated, getAccessToken, user } = usePrivy()
  const { search } = useLocation()
  const navigate = useNavigate()
  const scope = authenticated ? user?.id ?? 'pending' : ''
  const cached = scope ? opportunityCache.get(scope) : undefined
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => cached ?? [])
  const [loading, setLoading] = useState(() => !cached)
  const [authorized, setAuthorized] = useState(() => Boolean(cached))
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const earnTo = useStreamPayPath('/funding')
  const fundingTo = useStreamPayPath('/funding?view=funding')
  const [error, setError] = useState('')
  const selectedId = new URLSearchParams(search).get('position') || ''
  const loadSequence = useRef(0)

  const load = useCallback(async (silent = false) => {
    if (!upfrontSettlementV3Enabled) { setAuthorized(false); setLoading(false); return }
    if (!authenticated) { setAuthorized(false); setLoading(false); return }
    const sequence = ++loadSequence.current
    if (!silent) {
      setLoading(!opportunityCache.has(scope))
      if (!opportunityCache.has(scope)) setAuthorized(false)
      setError('')
    }
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to open funding.')
      const response = await fetchWithTimeout(API, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const body = await response.json().catch(() => ({})) as { opportunities?: Opportunity[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Funding requests could not be loaded.')
      if (sequence !== loadSequence.current) return
      setAuthorized(true)
      const next = body.opportunities ?? []
      setOpportunities(current => {
        const stable = reconcileFundingPositions(current, next)
        opportunityCache.set(scope, stable)
        return stable
      })
    } catch (reason) {
      if (!silent && sequence === loadSequence.current) setError(reason instanceof Error ? reason.message : 'Funding requests could not be loaded.')
    } finally {
      if (!silent && sequence === loadSequence.current) setLoading(false)
    }
  }, [authenticated, getAccessToken, scope])

  useEffect(() => {
    setOpportunities(scope ? opportunityCache.get(scope) ?? [] : [])
  }, [scope])

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
  const completedPositions = useMemo(() => positions.filter(item => ['settled', 'refunded', 'expired', 'declined'].includes(item.positionStatus)), [positions])
  const visibleCompletedPositions = historyExpanded ? completedPositions : completedPositions.slice(0, 3)
  const deployedUnits = useMemo(() => activePositions.reduce((total, item) => total + (/^\d+$/.test(item.requestedAdvanceUsdcUnits) ? BigInt(item.requestedAdvanceUsdcUnits) : 0n), 0n).toString(), [activePositions])
  const selected = opportunities.find(item => item.id === selectedId)

  if (!ready || loading) return <StreamPayLoadingState active="funding" />
  if (!authenticated) return <Navigate to={earnTo} replace />
  if (!upfrontSettlementV3Enabled) return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3">
      <Link to={earnTo} aria-label="Back to Earn" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link>
      <h1 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">Funding</h1>
    </div>
    <div className="stream-empty mt-5 px-6 py-12">
      <BanknotesIcon className="mx-auto h-7 w-7 text-gray-300" />
      <p className="mt-3 text-sm font-black text-gray-950 dark:text-white">Funding is temporarily unavailable</p>
      <p className="mt-1 text-[11px] leading-5 text-gray-400">No requests can be funded right now. Existing positions remain visible.</p>
    </div>
  </section>

  if (selected) return <FundingDetail item={selected} onBack={() => navigate(fundingTo, { replace: true })} onUpdated={load} />

  return <section className="stream-screen w-full max-w-md space-y-4 py-5 sm:py-8">
    <div className="flex items-center gap-3">
      <Link to={earnTo} aria-label="Back to Earn" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link>
      <div><h1 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">Funding</h1><p className="mt-0.5 text-[11px] text-gray-400">Private requests sent directly to you.</p></div>
    </div>

    {authorized && (upfrontTreasuryEnabled
      ? <UpfrontTreasuryWallet deployedUsdcUnits={deployedUnits} activePositions={activePositions.length} />
      : <div className="stream-card p-4 text-xs text-gray-500">Funding transactions are currently locked.</div>)}

    {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-bold underline">Try again</button></div>}

    {!error && <OpportunitySection title="Incoming requests" count={openOffers.length}>
      {openOffers.length > 0
        ? openOffers.map(item => <OpportunityRow key={item.id} item={item} onOpen={() => navigate(`${fundingTo}&position=${encodeURIComponent(item.id)}`)} />)
        : <EmptyState title="No funding requests" detail="Private requests sent to you will appear here." />}
    </OpportunitySection>}

    {!error && activePositions.length > 0 && <OpportunitySection title="Active positions" count={activePositions.length}>
      {activePositions.map(item => <OpportunityRow key={item.id} item={item} onOpen={() => navigate(`${fundingTo}&position=${encodeURIComponent(item.id)}`)} />)}
    </OpportunitySection>}

    {!error && completedPositions.length > 0 && <OpportunitySection title="History" count={completedPositions.length}>
      <div className="stream-list-card overflow-hidden">
        {visibleCompletedPositions.map((item, index) => <OpportunityRow key={item.id} item={item} compact separated={index > 0} onOpen={() => navigate(`${fundingTo}&position=${encodeURIComponent(item.id)}`)} />)}
        {completedPositions.length > 3 && <button type="button" onClick={() => setHistoryExpanded(value => !value)} className="min-h-11 w-full border-t border-gray-100 px-4 text-center text-[11px] font-black text-blue-600 dark:border-white/[0.07] dark:text-blue-300">{historyExpanded ? 'Show less' : `View all ${completedPositions.length}`}</button>}
      </div>
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

function OpportunityRow({ item, onOpen, compact = false, separated = false }: { item: Opportunity; onOpen: () => void; compact?: boolean; separated?: boolean }) {
  return <button type="button" onClick={onOpen} className={`${compact ? `flex min-h-[68px] ${separated ? 'border-t border-gray-100 dark:border-white/[0.07]' : ''} px-3 py-2.5` : 'stream-card flex min-h-[82px] p-3.5'} w-full items-center gap-3 text-left transition active:scale-[0.99]`}>
    <span className={`flex ${compact ? 'h-9 w-9' : 'h-11 w-11'} shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300`}><BanknotesIcon className="h-4 w-4" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-gray-950 dark:text-white">{item.title}</span><span className="mt-1 block truncate text-[10px] font-semibold text-gray-400">{positionLabel(item.positionStatus)} {'\u00b7'} {duration(item.durationSeconds)}</span></span>
    <span className="shrink-0 text-right"><span className="block text-xs font-black tabular-nums text-gray-950 dark:text-white">{usdc(item.requestedAdvanceUsdcUnits)}</span><span className="mt-1 block text-[9px] text-gray-400">{item.maximumAdvanceBps / 100}% limit</span></span>
    {!compact && <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" />}
  </button>
}

function FundingDetail({ item, onBack, onUpdated }: { item: Opportunity; onBack: () => void; onUpdated: () => Promise<void> | void }) {
  const { getAccessToken } = usePrivy()
  const [declining, setDeclining] = useState(false)
  const [declineError, setDeclineError] = useState('')
  const quote = item.fundingTerms?.quote
  const completed = item.positionStatus === 'settled'
  const escrowAddress = (() => {
    const domain = item.onchainOffer?.domain
    if (!domain || typeof domain !== 'object' || Array.isArray(domain)) return undefined
    return String((domain as Record<string, unknown>).verifyingContract ?? '')
  })()
  const [detailsOpen, setDetailsOpen] = useState(completed)
  useEffect(() => {
    if (completed) setDetailsOpen(true)
  }, [completed])
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

    <article className="stream-card mt-5 p-4">
      <div className="grid grid-cols-3 gap-3 rounded-[22px] bg-zinc-950 px-4 py-4 text-white dark:bg-[#171717]">
        <SummaryMetric label={completed ? 'You funded' : 'You fund'} value={usdc(item.requestedAdvanceUsdcUnits)} />
        <SummaryMetric label={completed ? 'You received' : 'You receive'} value={usdc(quote?.funderRepaymentUsdcUnits ?? '0')} />
        <SummaryMetric label={completed ? 'Profit earned' : 'Your profit'} value={usdc(quote?.funderProfitUsdcUnits ?? '0')} accent />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-white/[0.035]">
        <Metric label="Protected" value={usdc(item.protectedUsdcUnits)} />
        <Metric label="Term" value={duration(item.durationSeconds)} />
        <Metric label="AI confidence" value={`${item.confidence}%`} />
      </div>

      <p className="mt-4 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{item.evidenceGrade} evidence · approved up to {item.maximumAdvanceBps / 100}%.</p>
      {item.positionStatus === 'available' && <p className="mt-1 text-[10px] text-gray-400">Expires {new Date(item.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}

      <details open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)} className="mt-4 border-t border-gray-100 pt-3 dark:border-white/[0.07]">
        <summary className="cursor-pointer text-[11px] font-bold text-gray-500 dark:text-gray-300">Payment details</summary>
        <div className="mt-3 grid grid-cols-2 gap-4 rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-white/[0.035]">
          <Metric label="Provider received early" value={usdc(item.requestedAdvanceUsdcUnits)} />
          <Metric label={completed ? 'Provider received later' : 'Provider receives later'} value={usdc(quote?.providerRemainderUsdcUnits ?? '0')} />
          <Metric label="Provider total" value={usdc(quote?.providerTotalUsdcUnits ?? '0')} />
          <Metric label="HashPayStream fee" value={usdc(quote?.platformFeeUsdcUnits ?? '0')} />
          <div className="col-span-2"><p className="text-[10px] font-bold text-gray-400">Service provider wallet</p><p className="mt-1 font-mono text-xs font-bold text-gray-700 dark:text-gray-200">{short(item.providerPayoutAddress)}</p></div>
        </div>
      </details>

      {quote && ['funded', 'released', 'settled', 'refunded'].includes(item.positionStatus) && <FundingPositionReceipt receipt={{
        positionId: item.positionId,
        status: item.positionStatus as 'funded' | 'released' | 'settled' | 'refunded',
        escrowAddress,
        advanceUsdcUnits: item.requestedAdvanceUsdcUnits,
        repaymentUsdcUnits: item.positionStatus === 'refunded' ? item.requestedAdvanceUsdcUnits : quote.funderRepaymentUsdcUnits,
        profitUsdcUnits: item.positionStatus === 'refunded' ? '0' : quote.funderProfitUsdcUnits,
        platformFeeUsdcUnits: quote.platformFeeUsdcUnits,
      }} />}

      {item.positionStatus === 'available'
        ? <div><UpfrontFundButton opportunity={item} onFunded={onUpdated} /><button type="button" disabled={declining} onClick={() => void decline()} className="mt-2 min-h-10 w-full text-xs font-bold text-gray-400 disabled:opacity-50">{declining ? 'Declining…' : 'Decline request'}</button>{declineError && <p className="mt-2 text-[11px] text-rose-600">{declineError}</p>}</div>
        : item.positionStatus === 'expired' || item.positionStatus === 'declined'
          ? <p className="mt-5 rounded-2xl bg-gray-50 px-4 py-3 text-[11px] leading-5 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">{item.positionStatus === 'expired' ? 'This funding request expired before funds moved.' : 'You declined this funding request.'}</p>
          : <UpfrontLifecycleButton opportunity={{ ...item, positionStatus: item.positionStatus }} onUpdated={onUpdated} />}
    </article>
  </section>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="stream-empty px-5 py-8"><BanknotesIcon className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-3 text-sm font-black text-gray-950 dark:text-white">{title}</p><p className="mt-1 text-[11px] text-gray-400">{detail}</p></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold text-gray-400">{label}</p><p className="mt-1 truncate text-xs font-black tabular-nums text-gray-950 dark:text-white">{value}</p></div>
}

function SummaryMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold text-white/45">{label}</p><p className={`mt-1 truncate text-xs font-black tabular-nums ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</p></div>
}
