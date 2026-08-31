import { BanknotesIcon, ChevronRightIcon, CircleStackIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

type FundingStatus = 'not_applied' | 'pending' | 'approved' | 'restricted' | undefined

export default function StreamPayGrow({ fundingStatus }: { fundingStatus: FundingStatus }) {
  const savingsTo = useStreamPayPath('/savings')
  const fundingTo = useStreamPayPath('/funding?view=funding')

  const fundingCopy = fundingStatus === 'approved'
    ? 'Review private funding requests sent directly to you.'
    : fundingStatus === 'pending'
      ? 'Your funding partner application is under review.'
      : fundingStatus === 'restricted'
        ? 'Funding access is currently restricted.'
        : 'Apply to receive eligible early-pay requests.'

  return (
    <section className="stream-screen min-h-[calc(100dvh-6rem)] w-full max-w-md pb-28 pt-7">
      <header className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><SparklesIcon className="h-6 w-6" /></span>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">Earn</h1>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-zinc-500 dark:text-zinc-400">Save USDC or fund verified work from one place.</p>
      </header>
      <div className="mt-9 flex items-end justify-between"><h2 className="text-sm font-black">Choose how to earn</h2><span className="stream-pill text-emerald-600 dark:text-emerald-400">USDC only</span></div>
      <div className="mt-3 space-y-3">
        <Link to={savingsTo} className="stream-feature-card group">
          <span className="stream-feature-icon bg-emerald-500/10 text-emerald-500"><CircleStackIcon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-black">Savings</span><span className="mt-1 block text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">Set USDC aside with weekly or monthly releases. Verified yield markets remain separate.</span></span>
          <ChevronRightIcon className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
        </Link>
        <Link to={fundingTo} className="stream-feature-card group">
          <span className="stream-feature-icon bg-blue-500/10 text-blue-500"><BanknotesIcon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-black">Funding partners</span><span className="mt-1 block text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{fundingCopy}</span></span>
          <ChevronRightIcon className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <p className="mt-6 px-3 text-center text-[10px] leading-5 text-zinc-500">Returns are variable and never guaranteed. Funding and savings remain separate products.</p>
    </section>
  )
}
