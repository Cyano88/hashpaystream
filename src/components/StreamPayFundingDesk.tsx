import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, ArrowPathIcon, BanknotesIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { Navigate } from '../lib/router'
import { upfrontTreasuryEnabled } from '../lib/upfrontChains'
import UpfrontTreasuryWallet from './UpfrontTreasuryWallet'
import UpfrontFundButton from './UpfrontFundButton'
import UpfrontLifecycleButton from './UpfrontLifecycleButton'
import { LoadingRing } from './ui/LoadingRing'

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
  return 'Open'
}

export default function StreamPayFundingDesk() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const load = useCallback(async () => {
    if (!authenticated) { setAuthorized(false); setLoading(false); return }
    setLoading(true)
    setAuthorized(false)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to open funding.')
      const response = await fetch(API, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const body = await response.json().catch(() => ({})) as { opportunities?: Opportunity[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Funding opportunities could not be loaded.')
      setAuthorized(true)
      setOpportunities(body.opportunities ?? [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Funding opportunities could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => { if (ready) void load() }, [load, ready])

  const openOffers = useMemo(() => opportunities.filter(item => item.positionStatus === 'available'), [opportunities])
  const positions = useMemo(() => opportunities.filter(item => item.positionStatus !== 'available'), [opportunities])
  const activePositions = useMemo(() => positions.filter(item => item.positionStatus === 'funded' || item.positionStatus === 'released'), [positions])
  const deployedUnits = useMemo(() => activePositions.reduce((total, item) => total + (/^\d+$/.test(item.requestedAdvanceUsdcUnits) ? BigInt(item.requestedAdvanceUsdcUnits) : 0n), 0n).toString(), [activePositions])
  const selected = opportunities.find(item => item.id === selectedId)

  if (!ready || loading) return <div className="flex min-h-[58vh] items-center justify-center"><LoadingRing className="h-5 w-5 text-gray-300" /></div>
  if (!authenticated) return <Navigate to="/funding" replace />

  if (selected) return <FundingDetail item={selected} onBack={() => setSelectedId('')} onUpdated={load} />

  return <section className="w-full max-w-md space-y-4 py-5 sm:py-8">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Earn</p><h1 className="mt-1 text-xl font-black tracking-tight text-gray-950 dark:text-white">Funding</h1></div>
      <button type="button" onClick={() => void load()} aria-label="Refresh funding" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm dark:bg-white/[0.06]"><ArrowPathIcon className="h-4 w-4" /></button>
    </div>

    {authorized && (upfrontTreasuryEnabled
      ? <UpfrontTreasuryWallet deployedUsdcUnits={deployedUnits} activePositions={activePositions.length} />
      : <div className="rounded-[24px] border border-gray-100 bg-white p-4 text-xs text-gray-500 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">Funding transactions are currently locked.</div>)}

    <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-3 text-[10px] leading-4 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <p>{XLAYER_MAINNET ? 'Public test: customer protection is test USDC on Arc; advances use real USDC on X Layer.' : 'Demo mode: customer protection and advances use test funds.'}</p>
    </div>

    {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-bold underline">Try again</button></div>}

    {!error && <OpportunitySection title="Open opportunities" count={openOffers.length}>
      {openOffers.length > 0
        ? openOffers.map(item => <OpportunityRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />)
        : <EmptyState title="No live offers" detail="Approved funding opportunities will appear here." />}
    </OpportunitySection>}

    {!error && positions.length > 0 && <OpportunitySection title="Your funding" count={positions.length}>
      {positions.map(item => <OpportunityRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />)}
    </OpportunitySection>}
  </section>
}

function OpportunitySection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section>
    <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-xs font-black text-gray-950 dark:text-white">{title}</h2><span className="text-[10px] font-bold text-gray-400">{count}</span></div>
    <div className="space-y-2">{children}</div>
  </section>
}

function OpportunityRow({ item, onOpen }: { item: Opportunity; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="flex min-h-[82px] w-full items-center gap-3 rounded-[22px] border border-gray-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] dark:border-white/[0.07] dark:bg-white/[0.035]">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300"><BanknotesIcon className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-gray-950 dark:text-white">{item.title}</span><span className="mt-1 block text-[10px] font-semibold text-gray-400">{positionLabel(item.positionStatus)} · {duration(item.durationSeconds)}</span></span>
    <span className="shrink-0 text-right"><span className="block text-xs font-black tabular-nums text-gray-950 dark:text-white">{usdc(item.requestedAdvanceUsdcUnits)}</span><span className="mt-1 block text-[9px] text-gray-400">advance</span></span>
    <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" />
  </button>
}

function FundingDetail({ item, onBack, onUpdated }: { item: Opportunity; onBack: () => void; onUpdated: () => Promise<void> | void }) {
  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} aria-label="Back to funding" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm dark:bg-white/[0.06] dark:text-white"><ArrowLeftIcon className="h-4 w-4" /></button>
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{positionLabel(item.positionStatus)}</p><h1 className="truncate text-xl font-black tracking-tight text-gray-950 dark:text-white">{item.title}</h1></div>
    </div>

    <article className="mt-5 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Metric label="Advance" value={usdc(item.requestedAdvanceUsdcUnits)} />
        <Metric label="Protected" value={usdc(item.protectedUsdcUnits)} />
        <Metric label="Term" value={duration(item.durationSeconds)} />
        <Metric label="AI confidence" value={`${item.confidence}%`} />
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/[0.07]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Service provider</p>
        <p className="mt-1 font-mono text-xs font-bold text-gray-700 dark:text-gray-200">{short(item.providerPayoutAddress)}</p>
        <p className="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{item.evidenceGrade} evidence · AI-approved limit {item.maximumAdvanceBps / 100}%.</p>
        {item.positionStatus === 'available' && <p className="mt-2 text-[10px] text-gray-400">Offer expires {new Date(item.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}
      </div>

      {item.positionStatus === 'available'
        ? <UpfrontFundButton opportunity={item} onFunded={onUpdated} />
        : <UpfrontLifecycleButton opportunity={{ ...item, positionStatus: item.positionStatus }} onUpdated={onUpdated} />}
    </article>
  </section>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-[22px] border border-gray-100 bg-white px-5 py-8 text-center shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><BanknotesIcon className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-3 text-sm font-black text-gray-950 dark:text-white">{title}</p><p className="mt-1 text-[11px] text-gray-400">{detail}</p></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">{label}</p><p className="mt-1 text-sm font-black tabular-nums text-gray-950 dark:text-white">{value}</p></div>
}
