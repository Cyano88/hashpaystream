import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { CheckCircleIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { formatUsdcBalance } from '../lib/useAgreements'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

type Partner = { id: string; name: string; maximumRequestUsdcUnits: string; canCoverFullRequest: boolean }
type Selection = { partnerId: string; partnerName: string; advanceUsdcUnits: string; status: 'pending' | 'declined' | 'funded' | 'released' | 'refunded' | 'expired' }
const API = '/api/hashpaystream/v1/upfront/opportunities'

export default function FundingPartnerPicker({ requestId }: { requestId: string }) {
  const { getAccessToken } = usePrivy()
  const useFundsTo = useStreamPayPath('/move/xlayer/send')
  const [partners, setPartners] = useState<Partner[]>([])
  const [selection, setSelection] = useState<Selection>()
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to choose a funding partner.')
      const response = await fetch(`${API}?view=partners&requestId=${encodeURIComponent(requestId)}`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const body = await response.json().catch(() => ({})) as { partners?: Partner[]; selection?: Selection; error?: string }
      if (!response.ok) throw new Error(body.error || 'Funding partners could not be loaded.')
      setPartners(body.partners ?? []); setSelection(body.selection)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Funding partners could not be loaded.')
    } finally { if (!silent) setLoading(false) }
  }, [getAccessToken, requestId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selection || !['pending', 'funded'].includes(selection.status)) return
    const timer = window.setInterval(() => void load(true), 15_000)
    return () => window.clearInterval(timer)
  }, [load, selection?.status])

  async function select(partner: Partner) {
    setSelecting(partner.id); setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to send this funding request.')
      const response = await fetch(API, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'select_partner', requestId, partnerId: partner.id, advanceUsdcUnits: partner.maximumRequestUsdcUnits }) })
      const body = await response.json().catch(() => ({})) as { selection?: Selection; error?: string }
      if (!response.ok || !body.selection) throw new Error(body.error || 'Your funding request could not be sent.')
      setSelection(body.selection); setPartners([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your funding request could not be sent.')
    } finally { setSelecting('') }
  }

  if (loading) return <div className="mt-4 space-y-2" aria-label="Loading funding partners"><div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.05]" /><div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.05]" /></div>
  if (selection && ['pending', 'funded', 'released'].includes(selection.status)) return <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100">
    <div className="flex items-start gap-3"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs font-black">{selection.status === 'pending' ? 'Funding request sent' : selection.status === 'funded' ? 'Early pay funded' : 'Early pay received'}</p><p className="mt-1 text-[11px] leading-5 opacity-75">{selection.partnerName} / {formatUsdcBalance(selection.advanceUsdcUnits)}</p>{selection.status === 'pending' && <p className="mt-1 text-[10px] opacity-60">Waiting for the partner to fund or decline.</p>}{selection.status === 'funded' && <p className="mt-1 text-[10px] opacity-60">The partner funded the protected release. Waiting for X Layer confirmation.</p>}{selection.status === 'released' && <><p className="mt-1 text-[10px] opacity-70">Confirmed on X Layer and available in your HashPayStream wallet.</p><Link to={useFundsTo} className="mt-3 inline-flex min-h-9 items-center rounded-full bg-emerald-900 px-4 text-[11px] font-black text-white dark:bg-emerald-300 dark:text-emerald-950">Use funds</Link></>}</div></div>
  </div>

  return <div className="mt-4">
    <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black text-gray-950 dark:text-white">Choose a funding partner</p><p className="mt-1 text-[10px] leading-4 text-gray-400">Only partners who can cover part or all of this request appear.</p></div><span className="text-[10px] font-bold text-gray-400">{partners.length}</span></div>
    {selection?.status === 'declined' && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[10px] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">The previous partner declined. Choose another available partner.</p>}
    {partners.length ? <div className="mt-3 space-y-2">{partners.map(partner => <button key={partner.id} type="button" disabled={Boolean(selecting)} onClick={() => void select(partner)} className="stream-card flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-50"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-gray-950 dark:text-white">{partner.name}</span><span className="mt-1 block text-[10px] text-gray-400">{partner.canCoverFullRequest ? 'Can cover your full request' : `Request up to ${formatUsdcBalance(partner.maximumRequestUsdcUnits)}`}</span></span><span className="text-right text-[11px] font-black tabular-nums text-gray-700 dark:text-gray-200">{formatUsdcBalance(partner.maximumRequestUsdcUnits)}</span><ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" /></button>)}</div> : <p className="mt-3 rounded-2xl bg-gray-50 px-4 py-5 text-center text-xs leading-5 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">No approved partner has enough available X Layer USDC right now.</p>}
    {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-1 font-black underline">Try again</button></div>}
  </div>
}