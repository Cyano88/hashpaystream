import HostedAccountConnection from './HostedAccountConnection'
import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { readStockBalances, stockPortfolioExpiresAt, stockPortfolioValueIsFresh } from '../lib/readStockBalances'
import type { StockPortfolio } from '../lib/readStockBalances'

type Holding = StockPortfolio['holdings'][number]
type Snapshot = { scope: string; status: 'ready' | 'unavailable' | 'error' | 'connection'; holdings: Holding[]; portfolio?: StockPortfolio; refreshError?: boolean }
// Keep the last account-scoped result across Home navigation; refresh it quietly.
let lastStockSnapshot: Snapshot | undefined
export function useStockPortfolio(legacy = false) {
  const { ready, user, getAccessToken } = usePrivy()
  // A balance read needs the linked address, not an initialized transaction signer.
  // The server independently verifies this wallet against the authenticated account.
  const embedded = (user?.linkedAccounts || []).filter(account => account.type === 'wallet'
    && account.chainType === 'ethereum' && account.walletClientType === 'privy' && account.connectorType === 'embedded')
  const address = ready && embedded.length === 1 && embedded[0].type === 'wallet' ? embedded[0].address : ''
  const scope = (user?.id || '') + ':' + (legacy ? 'legacy:' + address.toLowerCase() : 'connected')
  const getToken = useRef(getAccessToken); getToken.current = getAccessToken
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(() => lastStockSnapshot?.scope === scope ? lastStockSnapshot : undefined)
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const controller = new AbortController()
    let inFlight = false
    setSnapshot(previous => previous?.scope === scope ? previous : lastStockSnapshot?.scope === scope ? lastStockSnapshot : undefined)
    if (lastStockSnapshot?.scope !== scope) lastStockSnapshot = undefined
    if (!ready || !user) {
      const timer = window.setTimeout(() => setSnapshot({ scope, status: 'unavailable', holdings: [] }), 10000)
      return () => { controller.abort(); window.clearTimeout(timer) }
    }
    if (legacy && !address) { setSnapshot({ scope, status: 'unavailable', holdings: [] }); return () => controller.abort() }
    const load = async () => {
      setNow(Date.now())
      if (inFlight || controller.signal.aborted || document.visibilityState === 'hidden') return
      inFlight = true
      const request = new AbortController()
      const abortRequest = () => request.abort()
      controller.signal.addEventListener('abort', abortRequest, { once: true })
      let deadline = 0
      let rejectCancelled: (() => void) | undefined
      try {
        const portfolio = await Promise.race([
          (async () => {
        const token = await getToken.current()
        if (request.signal.aborted) throw Error('Request cancelled.')
        if (!token) throw Error('Sign in again.')
        return readStockBalances(legacy ? address : undefined, token, request.signal)
          })(),
          new Promise<never>((_, reject) => {
            deadline = window.setTimeout(() => { request.abort(); reject(Error('Stock balances took too long.')) }, 50000)
            rejectCancelled = () => reject(Error('Request cancelled.'))
            controller.signal.addEventListener('abort', rejectCancelled, { once: true })
          }),
        ])
        if (!controller.signal.aborted) setSnapshot({ scope, status: 'ready', holdings: portfolio.holdings, portfolio })
      } catch (error) {
        if (!controller.signal.aborted && (error as {needsConnection?:boolean}).needsConnection) { setSnapshot({scope,status:'connection',holdings:[]}); return }
        if (!controller.signal.aborted) setSnapshot(previous => previous?.scope === scope && previous.status === 'ready'
          ? { ...previous, refreshError: true } : { scope, status: 'error', holdings: [] })
      } finally { window.clearTimeout(deadline); if (rejectCancelled) controller.signal.removeEventListener('abort', rejectCancelled); controller.signal.removeEventListener('abort', abortRequest); inFlight = false; if (!controller.signal.aborted) { setNow(Date.now()) } }
    }
    const refresh = () => { void load() }
    refresh()
    const interval = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('hashpaystream:resume', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort(); window.clearInterval(interval)
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
      window.removeEventListener('hashpaystream:resume', refresh); document.removeEventListener('visibilitychange', refresh)
    }
  }, [scope, ready, revision])
  useEffect(() => {
    if (snapshot?.scope === scope && snapshot.status === 'ready') lastStockSnapshot = snapshot
    setNow(Date.now())
    const expiry = snapshot?.scope === scope && snapshot.portfolio ? stockPortfolioExpiresAt(snapshot.portfolio) : 0
    if (expiry <= Date.now()) return
    const timer = window.setTimeout(() => setNow(Date.now()), expiry - Date.now() + 1)
    return () => window.clearTimeout(timer)
  }, [snapshot, scope])
  const current = snapshot?.scope === scope ? snapshot : undefined
  const loaded = current?.status === 'ready'
  const valueFresh = loaded && !!current.portfolio && stockPortfolioValueIsFresh(current.portfolio, now)
  const expired = loaded && !!current.portfolio && (!Number.isFinite(current.portfolio.observedAt) || now - current.portfolio.observedAt >= 60000 || stockPortfolioExpiresAt(current.portfolio) <= now)
  return { current, loaded, valueFresh, expired, now, retry: () => setRevision(value => value + 1) }
}
export default function StocksBalanceCard({legacy = false}:{legacy?:boolean}) {
  const { current, loaded, valueFresh, expired, now, retry } = useStockPortfolio(legacy)
  const gas = current?.portfolio?.gas
  const gasFresh = gas && !gas.stale && now - gas.observedAt < 60000 && gas.observedAt <= now + 5000
  if (current?.status === 'connection') return <section className="rounded-[26px] border p-5"><p className="text-sm font-bold">Stocks balance</p><HostedAccountConnection/><button type="button" className="min-h-11 text-xs underline" onClick={retry}>Continue after connecting</button></section>
  return <section aria-label="Stocks balance" aria-busy={!current} className="relative flex min-h-[220px] min-w-full flex-col justify-between snap-center overflow-hidden rounded-[26px] border border-blue-900/70 bg-[#081326] px-5 py-6 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200/60">Stocks balance</p>
        <p className="mt-1.5 text-[clamp(1.75rem,9vw,2.5rem)] font-bold tabular-nums tracking-tight">{!current ? <span aria-label="Loading stock value" className="inline-block h-10 w-40 animate-pulse rounded-lg bg-white/10 align-middle motion-reduce:animate-none" /> : valueFresh && current.portfolio?.estimatedValueUsd !== null && current.portfolio?.estimatedValueUsd !== undefined ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(current.portfolio.estimatedValueUsd) : '\u2014'} <span className="text-xs font-medium tracking-normal text-white/50">estimated</span></p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-white/50"><span>OKB</span>{!current ? <span aria-label="Loading OKB balance" className="h-3 w-14 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /> : <span className="tabular-nums">{gasFresh ? gas.balance : '\u2014'}</span>}</div>
      </div><ChartBarIcon aria-hidden="true" className="mt-1 h-9 w-9 text-blue-300/70" />
    </div>
    <div className="mt-4 border-t border-white/10 pt-3">
      {!current ? <div aria-label="Loading stock balances" className="space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /><div className="h-3 w-1/2 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /></div>
        : loaded ? <>{(expired || current.refreshError || current.portfolio?.stale || !current.portfolio?.complete) && <p className="mb-2 text-[10px] text-amber-200">{expired || current.portfolio?.stale ? 'Last known balances. Updating is needed.' : current.refreshError ? 'Could not refresh. Showing the last update.' : 'Some balances are unavailable.'}</p>}{current.holdings.length ? <ul aria-label="Stock holdings" className="max-h-24 space-y-2 overflow-y-auto">{current.holdings.map(asset => <li key={asset.address} className="flex items-start justify-between gap-3 text-xs"><span className="shrink-0 font-bold">{asset.symbol}</span><span className="min-w-0 break-all text-right font-semibold tabular-nums text-white/80">{asset.balance}</span></li>)}</ul> : <p className="text-xs text-white/60">{current.portfolio?.complete && !expired ? 'No stocks in this wallet.' : 'Stock balances are incomplete.'}</p>}</>
        : <><p className="text-xs text-white/60">{current.status === 'unavailable' ? 'Stock balances are not available yet.' : 'Stock balances could not be loaded.'}</p><button type="button" onClick={retry} className="mt-2 min-h-8 text-[10px] font-bold text-blue-200 underline underline-offset-2">Try again</button></>}
    </div>
  </section>
}
