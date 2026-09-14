import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy, useSignTypedData, useWallets } from '@privy-io/react-auth'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { formatUnits, getAddress, isAddress, type Address, type Hex } from 'viem'
import FundingOfferSelector from './FundingOfferSelector'
import { STOCK_WORKER_RISK } from '../lib/stockFundingOffers'
import { STOCK_DELIVERY_TERMS_TYPES, stockDeliveryTermsMessage, type StockDeliveryAuthorization } from '../lib/stockDeliveryProtocol'
import { upfrontXLayerChain } from '../lib/upfrontChains'

const API = '/api/hashpaystream/v1/upfront/stock-deliveries'
const EXPECTED_CONTRACT = String(import.meta.env.VITE_HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS ?? '').trim()
const EXPECTED_ASSET = String(import.meta.env.VITE_HASHPAYSTREAM_STOCK_ASSET_ADDRESS ?? '').trim()
type Offer = {
  partnerId: string; partnerName: string; feeBps: number; verifiedCompletedFundingCount: number
  advanceUsdcUnits: string; stockTokenAmount: string; assetSymbol: string; assetDecimals: number
  authorization: StockDeliveryAuthorization & { quote: { advanceUsdcUnits: string; totalFundingFeeUsdcUnits: string; funderRepaymentUsdcUnits: string; platformFeeUsdcUnits: string; workerRemainderUsdcUnits: string } }
}
type Selection = { status: 'requested' | 'delivered' | 'settled' | 'declined' | 'expired'; partnerApplicationId: string; authorization: StockDeliveryAuthorization }
const usdc = (units: string) => formatUnits(BigInt(units), 6) + ' USDC'

export default function StockDeliveryPicker({ requestId, agreementId }: { requestId: string; agreementId: string }) {
  const { getAccessToken } = usePrivy(), { signTypedData } = useSignTypedData(), { wallets } = useWallets()
  const [offers, setOffers] = useState<Offer[]>([]), [selection, setSelection] = useState<Selection>()
  const [selectedId, setSelectedId] = useState(''), [acknowledged, setAcknowledged] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef(false)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to view stock offers.')
      const response = await fetch(`${API}?view=partners&requestId=${encodeURIComponent(requestId)}`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const body = await response.json().catch(() => ({})) as { offers?: Offer[]; selection?: Selection; error?: string }
      if (!response.ok) throw new Error(body.error || 'Stock offers are unavailable right now.')
      const next = body.offers ?? []
      setOffers(next); setSelection(body.selection); setSelectedId(current => next.some(item => item.partnerId === current) ? current : next[0]?.partnerId ?? '')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Stock offers are unavailable right now.') }
    finally { setLoading(false) }
  }, [getAccessToken, requestId])
  useEffect(() => { void load() }, [load])
  const selected = offers.find(item => item.partnerId === selectedId)
  const exactTerms = selected ? JSON.stringify(selected.authorization.terms) : ''

  async function confirm() {
    if (pending.current || !selected || acknowledged !== exactTerms) return
    pending.current = true; setBusy(true); setError('')
    try {
      const authorization = selected.authorization, now = Math.floor(Date.now() / 1000)
      const embedded = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
      if (embedded.length !== 1) throw new Error('Your X Layer payout wallet is still connecting.')
      const signer = embedded[0], worker = getAddress(signer.address)
      if (!isAddress(EXPECTED_CONTRACT) || !isAddress(EXPECTED_ASSET)
        || authorization.domain.name !== 'HashPayStream Stock Delivery' || authorization.domain.version !== '1'
        || authorization.domain.chainId !== upfrontXLayerChain.id || getAddress(authorization.domain.verifyingContract) !== getAddress(EXPECTED_CONTRACT)
        || getAddress(authorization.offer.worker) !== worker || getAddress(authorization.terms.stockAsset) !== getAddress(EXPECTED_ASSET)
        || authorization.terms.advanceUsdcAmount !== selected.advanceUsdcUnits || authorization.terms.stockTokenAmount !== selected.stockTokenAmount
        || authorization.terms.deadline <= now || selected.feeBps < 1 || selected.feeBps > 300) throw new Error('This stock offer changed or expired. Refresh offers.')
      const protectedAmount = BigInt(authorization.offer.protectedAmount)
      const advanceAmount = BigInt(authorization.terms.advanceUsdcAmount)
      const funderRepayment = BigInt(authorization.terms.funderRepaymentAmount)
      const platformFee = BigInt(authorization.terms.platformFeeAmount)
      const workerRemainder = BigInt(authorization.quote.workerRemainderUsdcUnits)
      if (advanceAmount <= 0n || funderRepayment < advanceAmount || platformFee <= 0n || workerRemainder <= 0n
        || authorization.quote.advanceUsdcUnits !== authorization.terms.advanceUsdcAmount
        || authorization.quote.funderRepaymentUsdcUnits !== authorization.terms.funderRepaymentAmount
        || authorization.quote.platformFeeUsdcUnits !== authorization.terms.platformFeeAmount
        || funderRepayment + platformFee + workerRemainder !== protectedAmount) throw new Error('This stock offer has an invalid payment breakdown. Refresh offers.')
      await signer.switchChain(upfrontXLayerChain.id)
      const { signature } = await signTypedData({ domain: authorization.domain, types: { DeliveryTerms: [...STOCK_DELIVERY_TERMS_TYPES.DeliveryTerms] }, primaryType: 'DeliveryTerms', message: stockDeliveryTermsMessage(authorization.terms) }, { address: worker, uiOptions: { showWalletUIs: false } })
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to confirm this stock offer.')
      const response = await fetch(API, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'select_offer', requestId, agreementId, partnerId: selected.partnerId, authorization, workerSignature: signature as Hex }) })
      const body = await response.json().catch(() => ({})) as { request?: Selection; error?: string }
      if (!response.ok || !body.request) throw new Error(body.error || 'The stock offer could not be confirmed.')
      setSelection(body.request); setOffers([]); setAcknowledged('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The stock offer could not be confirmed.') }
    finally { pending.current = false; setBusy(false) }
  }

  if (loading) return <div className="mt-4 h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.05]" aria-label="Loading stock offers" />
  if (selection && ['requested', 'delivered', 'settled'].includes(selection.status)) return <div className="mt-4 flex gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100"><CheckCircleIcon className="h-5 w-5 shrink-0" /><div><p className="text-xs font-black">{selection.status === 'requested' ? 'Stock request sent' : selection.status === 'delivered' ? 'Stock received' : 'Payment complete'}</p><p className="mt-1 text-[10px] leading-4 opacity-70">{selection.status === 'requested' ? 'Waiting for the selected funder to deliver the exact tokens.' : 'Delivery is linked to your protected Arc agreement.'}</p></div></div>
  return <div className="mt-4">
    {selected ? <>
      <FundingOfferSelector offers={offers.map(offer => ({ id: offer.partnerId, name: offer.partnerName, feeBps: offer.feeBps, feeLabel: usdc(offer.authorization.quote.totalFundingFeeUsdcUnits), verifiedCompletedFundingCount: offer.verifiedCompletedFundingCount }))} selectedId={selectedId} disabled={busy} onSelect={id => { setSelectedId(id); setAcknowledged(''); setError('') }}>
        <div className="mt-3 space-y-1 text-[10px] text-gray-500 dark:text-gray-400"><p>Receive {formatUnits(BigInt(selected.stockTokenAmount), selected.assetDecimals)} {selected.assetSymbol} now.</p><p>Fixed deduction: {usdc(selected.authorization.quote.funderRepaymentUsdcUnits)} plus {usdc(selected.authorization.quote.platformFeeUsdcUnits)} platform fee.</p><p>Remaining earnings: {usdc(selected.authorization.quote.workerRemainderUsdcUnits)}.</p><p>Payment date: {new Date(selected.authorization.offer.protectionDeadline * 1000).toLocaleDateString()}.</p></div>
      </FundingOfferSelector>
      <p className="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{STOCK_WORKER_RISK}</p>
      <label className="mt-3 flex items-start gap-2 text-[11px] leading-5"><input type="checkbox" className="mt-1" disabled={busy} checked={acknowledged === exactTerms} onChange={event => setAcknowledged(event.target.checked ? exactTerms : '')} />I accept this exact token amount and fixed USDC deduction.</label>
      <button type="button" disabled={busy || acknowledged !== exactTerms} onClick={() => void confirm()} className="mt-4 w-full rounded-full bg-emerald-500 px-5 py-3.5 text-xs font-black text-emerald-950 disabled:opacity-40">{busy ? 'Confirming stock offer...' : 'Confirm stock offer'}</button>
    </> : !error && <p className="rounded-2xl bg-gray-50 px-4 py-5 text-center text-xs text-gray-500 dark:bg-white/[0.04]">No eligible stock offer can cover this request right now.</p>}
    {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-black underline">Try again</button></div>}
    <button type="button" disabled={busy} onClick={() => void load()} className="mt-3 min-h-10 text-[11px] font-bold text-gray-500">Refresh offers</button>
  </div>
}