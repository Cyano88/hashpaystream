import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { rankFundingOffers } from '../lib/stockFundingOffers'

export type FundingOfferOption = {
  id: string
  name: string
  feeBps: number
  feeLabel: string
  verifiedCompletedFundingCount?: number
  detail?: string
}

function OfferDetails({ offer }: { offer: FundingOfferOption }) {
  return <><span className="block text-xs font-black">{offer.name}</span>
    <span className="mt-1 block text-[10px] text-gray-500 dark:text-gray-400">{offer.verifiedCompletedFundingCount === undefined ? 'Completed funding not yet verified' : `${offer.verifiedCompletedFundingCount} completed funding`}</span>
    <span className="mt-2 block text-[11px] font-bold">{offer.feeBps / 100}% fee · {offer.feeLabel}</span>
    {offer.detail && <span className="mt-1 block text-[10px] text-gray-500 dark:text-gray-400">{offer.detail}</span>}</>
}

/** Choosing a row only updates selection. The parent owns explicit confirmation. */
export default function FundingOfferSelector({ offers, selectedId, onSelect, disabled = false, children }: {
  offers: FundingOfferOption[]
  selectedId: string
  onSelect: (id: string) => void
  disabled?: boolean
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const sheet = useRef<HTMLElement>(null)
  const titleId = useId()
  const close = useCallback(() => setOpen(false), [])
  const ranked = rankFundingOffers(offers)
  const selected = ranked.find(offer => offer.id === selectedId)
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => sheet.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key !== 'Tab') return
      const nodes = sheet.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex="0"]')
      if (!nodes?.length) { event.preventDefault(); return }
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet.current)) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open, close])
  useEffect(() => { if (disabled || !offers.length) close() }, [disabled, offers.length, close])
  return <div className="mt-3">
    {selected ? <div className="stream-card px-4 py-3.5">
      <p className="mb-3 text-[10px] font-bold text-gray-500 dark:text-gray-400">{selected.id === ranked[0]?.id ? 'Best offer available' : 'Selected offer'}</p>
      <OfferDetails offer={selected} />
      {children}
    </div> : <p className="text-xs text-gray-500">Choose an eligible offer to continue.</p>}
    {ranked.length > 0 && <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="mt-3 inline-flex min-h-10 items-center gap-1 text-[11px] font-bold text-gray-500 disabled:opacity-50 dark:text-gray-400">
      {selected ? 'See other eligible offers' : 'Choose an eligible offer'}<ChevronDownIcon className="h-3 w-3" />
    </button>}
    {open && createPortal(<div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section ref={sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] border border-zinc-200 bg-[#f6f6f3] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-zinc-950 shadow-2xl outline-none dark:border-white/10 dark:bg-[#111111] dark:text-white">
        <span className="mx-auto block h-1 w-10 rounded-full bg-zinc-300 dark:bg-white/20" />
        <div className="mt-5 flex items-center justify-between gap-3"><h2 id={titleId} className="text-sm font-black">Eligible offers</h2><button type="button" onClick={close} className="min-h-10 px-2 text-xs font-bold">Close</button></div>
        <p className="mb-4 text-[10px] text-zinc-500 dark:text-white/50">Ranked by completed funding, then fee.</p>
        <div className="space-y-2">{ranked.map(offer => <button type="button" key={offer.id} aria-pressed={offer.id === selectedId} onClick={() => { onSelect(offer.id); close() }} className="stream-card flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="min-w-0 flex-1"><OfferDetails offer={offer} /></span>
          {offer.id === selectedId && <CheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />}
        </button>)}</div>
      </section>
    </div>, document.body)}
  </div>
}
