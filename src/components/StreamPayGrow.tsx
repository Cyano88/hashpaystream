import { useState } from 'react'
import { ArrowLeftIcon, BanknotesIcon, ChevronRightIcon, CircleStackIcon, ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

type FundingStatus = 'not_applied' | 'pending' | 'approved' | 'restricted' | undefined

function UsdcMark() {
  return <img src="/brand/usdc-token.svg" alt="USDC" className="h-12 w-12 shrink-0 object-contain" />
}

export default function StreamPayGrow({ fundingStatus }: { fundingStatus: FundingStatus }) {
  const [savingsOpen, setSavingsOpen] = useState(false)
  const fundingTo = useStreamPayPath('/funding?view=funding')

  if (savingsOpen) return (
    <section className="stream-screen min-h-[calc(100dvh-6rem)] w-full max-w-md pb-28 pt-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setSavingsOpen(false)} aria-label="Back to Earn" className="stream-icon-button"><ArrowLeftIcon className="h-5 w-5" /></button>
        <div><h1 className="text-xl font-black tracking-tight">Savings</h1><p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Grow USDC you are not using.</p></div>
      </div>
      <article className="stream-card mt-7 p-5">
        <div className="flex items-center gap-4"><UsdcMark /><div className="min-w-0 flex-1"><h2 className="text-sm font-black">USDC markets</h2><p className="mt-1 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">Verified X Layer savings markets will appear here.</p></div><span className="stream-pill">Coming soon</span></div>
      </article>
      <div className="stream-empty mt-4">
        <ShieldCheckIcon className="mx-auto h-7 w-7 text-zinc-400" />
        <h2 className="mt-3 text-sm font-black">No reviewed market is live</h2>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-zinc-500 dark:text-zinc-400">HashPayStream will only show supported USDC markets after the provider, chain, contract, liquidity and current rate are verified.</p>
      </div>
    </section>
  )

  const fundingCopy = fundingStatus === 'approved'
    ? 'Review available agreements and choose which work to fund.'
    : fundingStatus === 'pending'
      ? 'Your funding partner application is under review.'
      : fundingStatus === 'restricted'
        ? 'Funding access is currently restricted.'
        : 'Apply to review eligible agreements and fund work early.'

  return (
    <section className="stream-screen min-h-[calc(100dvh-6rem)] w-full max-w-md pb-28 pt-7">
      <header className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><SparklesIcon className="h-6 w-6" /></span>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">Earn</h1>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-zinc-500 dark:text-zinc-400">Save USDC or fund verified work from one place.</p>
      </header>
      <div className="mt-9 flex items-end justify-between"><h2 className="text-sm font-black">Choose how to earn</h2><span className="stream-pill text-emerald-600 dark:text-emerald-400">USDC only</span></div>
      <div className="mt-3 space-y-3">
        <button type="button" onClick={() => setSavingsOpen(true)} className="stream-feature-card group">
          <span className="stream-feature-icon bg-emerald-500/10 text-emerald-500"><CircleStackIcon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-black">Savings</span><span className="mt-1 block text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">Deposit into reviewed USDC yield markets when they become available.</span></span>
          <ChevronRightIcon className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
        </button>
        <Link to={fundingTo} className="stream-feature-card group">
          <span className="stream-feature-icon bg-blue-500/10 text-blue-500"><BanknotesIcon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-black">Funding opportunities</span><span className="mt-1 block text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{fundingCopy}</span></span>
          <ChevronRightIcon className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <p className="mt-6 px-3 text-center text-[10px] leading-5 text-zinc-500">Returns are variable and never guaranteed. Funding and savings remain separate products.</p>
    </section>
  )
}
