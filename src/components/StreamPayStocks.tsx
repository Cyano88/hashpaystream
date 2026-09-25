import { useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import catalogue from '../lib/xStocksCatalog.json'
import ranking from '../lib/xStocksRanking.json'
import StocksBalanceCard from './StocksBalanceCard'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

type Asset = typeof catalogue.assets[number]
// Row spacing, typography and image treatment reuse PocketXStocksPage.AssetRow.
function AssetRow({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  const [imageFailed, setImageFailed] = useState(false)
  return <button type="button" onClick={onOpen} className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-[10px] font-black dark:bg-white/10">{!imageFailed ? <img src={asset.icon} onError={() => setImageFailed(true)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" /> : asset.symbol.slice(0, 3)}</span>
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{asset.name}</span><span className="mt-1 block text-[10px] text-gray-400">{asset.symbol}</span></span>
    <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
  </button>
}

export default function StreamPayStocks() {
  const { authenticated } = usePrivy()
  const home = useStreamPayPath('/home')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Asset>()
  const assets = useMemo(() => {
    const rank = (symbol: string) => { const index = ranking.symbols.indexOf(symbol); return index < 0 ? 1000 : index }
    const filter = query.trim().toLowerCase()
    return catalogue.assets.filter(asset => `${asset.name} ${asset.symbol} ${asset.address}`.toLowerCase().includes(filter))
      .sort((a, b) => rank(a.symbol) - rank(b.symbol) || a.name.localeCompare(b.name))
  }, [query])
  if (!authenticated) return <AgreementSignInLanding />
  return <section className="stream-screen w-full max-w-md space-y-4 py-5 sm:py-8">
    <header className="grid grid-cols-[44px_1fr_44px] items-center">
      {selected ? <button type="button" aria-label="Back to stocks" className="stream-icon-button" onClick={() => setSelected(undefined)}><ArrowLeftIcon className="h-4 w-4" /></button> : <Link to={home} aria-label="Back home" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link>}
      <h1 className="text-center text-lg font-extrabold">{selected?.symbol || 'xStocks'}</h1>
    </header>
    {selected ? <section className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#121212] dark:shadow-none">
      <h2 className="text-sm font-bold">{selected.name}</h2><p className="mt-1 text-xs text-gray-400">{selected.symbol} · X Layer</p>
      <dl className="mt-5 space-y-2 text-xs"><dt className="text-gray-400">Token contract</dt><dd className="break-all font-mono">{selected.address}</dd></dl>
    </section> : <>
      <StocksBalanceCard />
      <section className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#121212] dark:shadow-none">
        <label className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 dark:bg-white/[0.06]"><MagnifyingGlassIcon className="h-4 w-4 text-gray-400" /><input aria-label="Search stocks" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, symbol or contract" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
        <div className="mt-2">{assets.map(asset => <AssetRow key={asset.address} asset={asset} onOpen={() => setSelected(asset)} />)}</div>
        {!assets.length && <p className="py-5 text-center text-xs text-gray-400">No stocks found.</p>}
      </section>
    </>}
  </section>
}
