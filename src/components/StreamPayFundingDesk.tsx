import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, ArrowPathIcon, BanknotesIcon, ClipboardIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { AuthButton } from '../lib/AuthButton'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { upfrontSmartWalletEnabled } from '../lib/upfrontChains'
import UpfrontTreasuryWallet from './UpfrontTreasuryWallet'

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
}

const API = '/api/hashpaystream/v1/upfront/opportunities'
const XLAYER_MAINNET = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? '1952') === '196'

function usdc(units: string) {
  const padded = units.padStart(7, '0')
  return `${padded.slice(0, -6)}.${padded.slice(-6)}`.replace(/0+$/, '').replace(/\.$/, '') + ' USDC'
}

function short(value: string) {
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value
}

function duration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`
  return `${Math.round(seconds / 3600)} hours`
}

export default function StreamPayFundingDesk() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const upfrontTo = useStreamPayPath('/upfront')

  const load = useCallback(async () => {
    if (!authenticated) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to open the funding desk.')
      const response = await fetch(API, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const body = await response.json().catch(() => ({})) as { opportunities?: Opportunity[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Funding opportunities could not be loaded.')
      setOpportunities(body.opportunities ?? [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Funding opportunities could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => { if (ready) void load() }, [load, ready])

  async function copyOffer(item: Opportunity) {
    await navigator.clipboard.writeText(JSON.stringify({ requestId: item.id, agreementId: item.agreementId, advanceAmountUsdcUnits: item.requestedAdvanceUsdcUnits, onchainOffer: item.onchainOffer }, null, 2))
    setCopied(item.id)
    window.setTimeout(() => setCopied(''), 1800)
  }

  if (!ready || loading) return <div className="flex min-h-[58vh] items-center justify-center"><ArrowPathIcon className="h-5 w-5 animate-spin text-gray-300" /></div>
  if (!authenticated) return (
    <section className="flex min-h-[64vh] w-full max-w-md flex-col items-center justify-center text-center">
      <LockClosedIcon className="h-12 w-12 text-blue-600" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Private funding desk.</h1>
      <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Continue with an approved treasury or liquidity-provider account.</p>
      <AuthButton debugLabel="hashpaystream-funding-desk" className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Continue with email</AuthButton>
    </section>
  )

  return (
    <section className="w-full max-w-4xl py-8 sm:py-12">
      <Link to={upfrontTo} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="h-4 w-4" />Upfront</Link>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Approved funders only</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Upfront funding desk</h1><p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Review Arc Testnet agreements with verified PolyDesk offers for {XLAYER_MAINNET ? 'real-USDC X Layer mainnet' : 'X Layer testnet'} advances.</p></div>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-xs font-semibold text-gray-700 dark:border-white/10 dark:text-gray-200">Refresh</button>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"><strong>Mixed-network proof.</strong> Arc remains testnet and its test USDC has no financial value. {XLAYER_MAINNET ? 'Any X Layer advance uses real mainnet USDC and is a restricted technical demonstration, not economically protected collateral.' : 'No mainnet funds are used in this environment.'}</div>

      {upfrontSmartWalletEnabled ? <UpfrontTreasuryWallet /> : <div className="mt-4 rounded-2xl border p-4 text-xs"><strong>Treasury execution is locked.</strong> Reviewing offers cannot move funds.</div>}
      {error && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">{error}</div>}
      {!error && opportunities.length === 0 && <div className="mt-7 rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-[#18181b]"><BanknotesIcon className="mx-auto h-8 w-8 text-gray-300" /><h2 className="mt-4 text-lg font-semibold text-gray-950 dark:text-white">No live offers</h2><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Approved offers appear here after an eligible Arc agreement is funded and assessed.</p></div>}
      {!error && opportunities.length > 0 && <div className="mt-7 grid gap-4 md:grid-cols-2">{opportunities.map(item => {
        const spread = (BigInt(item.protectedUsdcUnits) - BigInt(item.requestedAdvanceUsdcUnits)).toString()
        return <article key={item.id} className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">Verified offer</p><h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">{item.title}</h2></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{XLAYER_MAINNET ? 'X Layer mainnet' : 'X Layer testnet'}</span></div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-y border-gray-100 py-4 dark:border-white/10"><Metric label="Advance" value={usdc(item.requestedAdvanceUsdcUnits)} /><Metric label="Protected" value={usdc(item.protectedUsdcUnits)} /><Metric label="Gross spread" value={usdc(spread)} /><Metric label="Term" value={duration(item.durationSeconds)} /></div>
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"><span>{item.evidenceGrade} evidence · {item.confidence}% confidence</span><span>{short(item.providerPayoutAddress)}</span></div>
          <p className="mt-3 text-[11px] text-gray-400">Offer expires {new Date(item.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Funding execution remains operator-controlled during the pilot.</p>
          <button type="button" onClick={() => void copyOffer(item)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-xs font-semibold text-white dark:bg-white dark:text-gray-950"><ClipboardIcon className="h-4 w-4" />{copied === item.id ? 'Offer copied' : 'Copy verified offer'}</button>
        </article>
      })}</div>}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">{label}</p><p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{value}</p></div>
}
