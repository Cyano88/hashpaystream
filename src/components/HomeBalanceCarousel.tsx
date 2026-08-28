import { useRef, useState } from 'react'
import { BellIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { formatUsdcBalance } from '../lib/useAgreements'
import { useXLayerUsdcBalance } from '../lib/useXLayerUsdcBalance'

type Props = {
  totalBalance: bigint
  availableBalance: bigint
  protectedBalance: bigint
  refundableBalance: bigint
  arcBalanceReady: boolean
  arcBalanceError: string
  refreshArcBalance: () => Promise<void> | void
  notificationsTo: string
  unreadCount: number
}

export default function HomeBalanceCarousel(props: Props) {
  const xLayer = useXLayerUsdcBalance()
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  function updatePage() {
    const node = scroller.current
    if (!node || node.clientWidth <= 0) return
    setActive(Math.max(0, Math.min(1, Math.round(node.scrollLeft / node.clientWidth))))
  }

  return <div>
    <div ref={scroller} onScroll={updatePage} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <section className="min-w-full snap-center overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-950 px-5 py-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:border-[#262626] dark:bg-[#121212]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 dark:text-gray-500">Total balance</p><p className="mt-1.5 min-w-0 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight">{props.arcBalanceReady ? formatUsdcBalance(props.totalBalance).replace(/ USDC$/, '') : '—'} <span className="text-xs font-medium tracking-normal opacity-50">USDC</span></p></div>
          <Link to={props.notificationsTo} aria-label={props.unreadCount ? `Open notifications, ${props.unreadCount} unread` : 'Open notifications'} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75 transition active:scale-95"><BellIcon className="h-5 w-5" />{props.unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-zinc-950" />}</Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <Metric label="Available" value={props.arcBalanceReady ? formatUsdcBalance(props.availableBalance) : '—'} />
          <Metric label="Protected" value={formatUsdcBalance(props.protectedBalance)} />
          <Metric label="Refundable" value={formatUsdcBalance(props.refundableBalance)} />
        </div>
        {props.arcBalanceError && !props.arcBalanceReady && <button type="button" onClick={() => void props.refreshArcBalance()} className="mt-3 text-[10px] font-bold text-white/65 underline underline-offset-2">Balance unavailable. Tap to retry.</button>}
      </section>

      <section className="min-w-full snap-center overflow-hidden rounded-[26px] border border-emerald-900/70 bg-[#07140d] px-5 py-5 text-white shadow-[0_18px_48px_rgba(6,78,45,0.14)] dark:border-emerald-900/70 dark:bg-[#07140d]">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/60">X Layer balance</p><p className="mt-1.5 min-w-0 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight">{xLayer.balanceReady && xLayer.units !== undefined ? formatUsdcBalance(xLayer.units).replace(/ USDC$/, '') : xLayer.ready && !xLayer.address ? '0' : '—'} <span className="text-xs font-medium tracking-normal opacity-50">USDC</span></p></div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <Metric label="Available" value={xLayer.balanceReady && xLayer.units !== undefined ? formatUsdcBalance(xLayer.units) : xLayer.ready && !xLayer.address ? '0 USDC' : '—'} />
          <Metric label="In savings" value="0 USDC" />
          <Metric label="Yield earned" value="0 USDC" />
        </div>
        {xLayer.error && <button type="button" onClick={() => void xLayer.refresh()} className="mt-3 text-[10px] font-bold text-emerald-200/70 underline underline-offset-2">Balance unavailable. Tap to retry.</button>}
      </section>
    </div>
    <div className="mt-2.5 flex justify-center gap-1.5" aria-label={`Balance card ${active + 1} of 2`}><span className={`h-1.5 rounded-full transition-all ${active === 0 ? 'w-5 bg-gray-950 dark:bg-white' : 'w-1.5 bg-gray-300 dark:bg-white/20'}`} /><span className={`h-1.5 rounded-full transition-all ${active === 1 ? 'w-5 bg-emerald-500' : 'w-1.5 bg-gray-300 dark:bg-white/20'}`} /></div>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-1 text-xs font-bold tabular-nums">{value}</p></div>
}
