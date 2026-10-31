import { useEffect, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import FundingOfferSelector from './FundingOfferSelector'
const formatExactUsdc = (units: string) => formatUnits(BigInt(units), 6) + ' USDC'
import { STOCK_WORKER_RISK, stockFeeUnits, stockOfferUnavailableReason, rankFundingOffers, type StockEligibilityContext, type StockOffer } from '../lib/stockFundingOffers'

export type StockFundingCheckoutProps = {
  offers: StockOffer[]
  contexts: Record<string, Omit<StockEligibilityContext, 'now'>>
  verifiedCompletedFundingCounts: Record<string, number>
  onConfirm: (offer: StockOffer) => Promise<void>
  onRefresh: () => Promise<void>
}

/** Rendered in the existing funder slot only when the new authenticated adapter supplies stock terms. */
export default function StockFundingCheckout({ offers, contexts, verifiedCompletedFundingCounts, onConfirm, onRefresh }: StockFundingCheckoutProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const eligible = rankFundingOffers(offers.filter(offer => contexts[offer.id] && !stockOfferUnavailableReason(offer, { ...contexts[offer.id], now }))
    .map(offer => ({ ...offer, verifiedCompletedFundingCount: verifiedCompletedFundingCounts[offer.funderId] })))
  const [selectedId, setSelectedId] = useState(() => eligible[0]?.id ?? '')
  const [acknowledgedTerms, setAcknowledgedTerms] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const selected = eligible.find(offer => offer.id === selectedId)
  const terms = selected ? JSON.stringify(selected) : ''
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])
  async function confirm() {
    if (pending.current || !selected || !terms || acknowledgedTerms !== terms) return
    const unavailable = stockOfferUnavailableReason(selected, { ...contexts[selected.id], now: Math.floor(Date.now() / 1000) })
    if (unavailable) { setError(unavailable); setAcknowledgedTerms(''); return }
    pending.current = true; setBusy(true); setError('')
    try { await onConfirm(selected); setAcknowledgedTerms('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Your payment could not be confirmed. Check its status before trying again.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className="mt-4">
    {eligible.length ? <FundingOfferSelector
      offers={eligible.map(offer => ({
        id: offer.id, name: offer.funderName, feeBps: offer.feeBps,
        feeLabel: formatExactUsdc(stockFeeUnits(BigInt(offer.principalUsdcUnits), offer.feeBps, contexts[offer.id].policy!.maxFeeBps).toString()),
        verifiedCompletedFundingCount: offer.verifiedCompletedFundingCount,
      }))}
      selectedId={selectedId} disabled={busy}
      onSelect={id => { setSelectedId(id); setAcknowledgedTerms(''); setError('') }}
    >
      {selected && <div className="mt-3 space-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <p>Receive {formatUnits(BigInt(selected.tokenUnits), contexts[selected.id].policy!.assetDecimals)} {contexts[selected.id].policy!.assetSymbol} · {formatExactUsdc(selected.principalUsdcUnits)} at this quote.</p>
        <p className="font-bold">Total from your earnings: {formatExactUsdc((BigInt(selected.principalUsdcUnits) + stockFeeUnits(BigInt(selected.principalUsdcUnits), selected.feeBps, contexts[selected.id].policy!.maxFeeBps)).toString())}</p>
        <p>Payment date: {new Date(selected.repayAt * 1000).toLocaleDateString()}</p>
      </div>}
    </FundingOfferSelector> : <p className="text-xs text-gray-500">No eligible stock offer is available right now.</p>}
    {selected && <>
      <p className="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{STOCK_WORKER_RISK}</p>
      <label className="mt-3 flex items-start gap-2 text-[11px] leading-5">
        <input type="checkbox" disabled={busy} checked={acknowledgedTerms === terms} onChange={event => setAcknowledgedTerms(event.target.checked ? terms : '')} className="mt-1" />
        I understand that my tokens can lose value and my USDC deduction stays fixed.
      </label>
      <button type="button" disabled={busy || acknowledgedTerms !== terms} onClick={() => void confirm()} className="mt-4 w-full rounded-full bg-emerald-500 px-5 py-3.5 text-xs font-black text-emerald-950 disabled:opacity-40">
        {busy ? 'Confirming payment...' : 'Confirm stock payment'}
      </button>
    </>}
    {!selected && selectedId && <p role="status" className="mt-3 text-xs text-gray-500">Your selected offer is no longer available. Choose another offer.</p>}
    <button type="button" disabled={busy} onClick={() => { setError(''); void onRefresh().catch(() => setError('Offers could not be refreshed. Try again.')) }} className="mt-3 min-h-10 text-[11px] font-bold text-gray-500">Refresh offers</button>
    {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
  </div>
}
