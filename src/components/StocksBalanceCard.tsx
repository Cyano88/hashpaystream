import { useEffect, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { readStockBalances } from '../lib/readStockBalances'
import type { StockPortfolio } from '../lib/readStockBalances'

type Holding = StockPortfolio['holdings'][number]
type Snapshot = { scope: string; status: 'ready' | 'unavailable' | 'error'; holdings: Holding[]; portfolio?: StockPortfolio }
export default function StocksBalanceCard() {
  const { user, getAccessToken } = usePrivy()
  const { ready, wallets } = useWallets()
  const embedded = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
  const address = ready && embedded.length === 1 ? embedded[0].address : ''
  const scope = (user?.id || '') + ':' + address.toLowerCase()
  const getToken = useRef(getAccessToken); getToken.current = getAccessToken
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setSnapshot(undefined)
    if (!ready || !user) return () => controller.abort()
    if (!address) { setSnapshot({ scope, status: 'unavailable', holdings: [] }); return () => controller.abort() }
    void (async () => {
      try {
        const token = await getToken.current()
        if (controller.signal.aborted) return
        if (!token) throw Error('Sign in again.')
        const portfolio = await readStockBalances(address, token, controller.signal)
        if (!controller.signal.aborted) setSnapshot({ scope, status: 'ready', holdings: portfolio.holdings, portfolio })
      } catch { if (!controller.signal.aborted) setSnapshot({ scope, status: 'error', holdings: [] }) }
    })()
    return () => controller.abort()
  }, [scope, ready, revision])
  const current = snapshot?.scope === scope ? snapshot : undefined
  const loaded = current?.status === 'ready'
  return <section aria-label="Stocks balance" aria-busy={!current} className="relative flex min-h-[220px] min-w-full flex-col justify-between snap-center overflow-hidden rounded-[26px] border border-blue-900/70 bg-[#081326] px-5 py-6 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200/60">Stocks balance</p>
        <p className="mt-1.5 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight">{loaded && current.portfolio?.estimatedValueUsd !== null && current.portfolio?.estimatedValueUsd !== undefined ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(current.portfolio.estimatedValueUsd) : '?'} <span className="text-xs font-medium tracking-normal text-white/50">estimated</span></p>
        <p className="mt-1 text-[10px] text-white/50">xStocks ? X Layer</p>
      </div><ChartBarIcon aria-hidden="true" className="mt-1 h-9 w-9 text-blue-300/70" />
    </div>
    <div className="mt-4 border-t border-white/10 pt-3">
      {!current ? <div aria-label="Loading stock balances" className="space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-white/10" /><div className="h-3 w-1/2 animate-pulse rounded bg-white/10" /></div>
        : loaded ? <>{(current.portfolio?.stale || !current.portfolio?.complete) && <p className="mb-2 text-[10px] text-amber-200">{current.portfolio?.stale ? 'Balances need refreshing.' : 'Some balances are unavailable.'}</p>}{current.holdings.length ? <ul aria-label="Stock holdings" className="max-h-24 space-y-2 overflow-y-auto">{current.holdings.map(asset => <li key={asset.address} className="flex items-start justify-between gap-3 text-xs"><span className="shrink-0 font-bold">{asset.symbol}</span><span className="min-w-0 break-all text-right font-semibold tabular-nums text-white/80">{asset.balance}</span></li>)}</ul> : <p className="text-xs text-white/60">{current.portfolio?.complete ? 'No stocks in this wallet.' : 'Stock balances are incomplete.'}</p>}<button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-8 text-[10px] font-bold text-blue-200 underline underline-offset-2">Refresh balances</button></>
        : <><p className="text-xs text-white/60">{current.status === 'unavailable' ? 'Stock balances are not available yet.' : 'Stock balances could not be loaded.'}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-8 text-[10px] font-bold text-blue-200 underline underline-offset-2">Try again</button></>}
    </div>
  </section>
}
