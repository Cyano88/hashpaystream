import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, CalendarDaysIcon, ChevronRightIcon, CircleStackIcon, ClockIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { formatUsdcBalance } from '../lib/useAgreements'
import { useSavingsVault } from '../lib/useSavingsVault'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
import SavingsDepositSheet from './savings/SavingsDepositSheet'
import SavingsPlanCard from './savings/SavingsPlanCard'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'

function releaseDate(value: number) {
  if (!value) return 'None'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value * 1000))
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className='min-w-0'><p className='text-[9px] font-bold uppercase tracking-[0.14em] text-white/40'>{label}</p><p className='mt-1 truncate text-[11px] font-bold tabular-nums'>{value}</p></div>
}

export default function StreamPaySavings() {
  const { authenticated } = usePrivy()
  const savings = useSavingsVault()
  const [depositOpen, setDepositOpen] = useState(false)
  const earnTo = useStreamPayPath('/funding')

  if (!authenticated) return <AgreementSignInLanding splashState='idle' />
  if (!savings.ready || !savings.savingsReady) return <StreamPayLoadingState active='home' />

  return <section className='stream-screen min-h-[calc(100dvh-6rem)] w-full max-w-md pb-28 pt-5'>
    <div className='flex items-center gap-3'>
      <Link to={earnTo} aria-label='Back to Earn' className='stream-icon-button'><ArrowLeftIcon className='h-5 w-5' /></Link>
      <div><h1 className='text-xl font-black tracking-tight'>Savings</h1><p className='mt-0.5 text-xs text-zinc-500 dark:text-zinc-400'>Save USDC where you earn it.</p></div>
    </div>

    <section className='relative mt-6 overflow-hidden rounded-[26px] border border-emerald-900/70 bg-[#07140d] p-5 text-white shadow-[0_18px_48px_rgba(6,78,45,0.14)]'>
      <p className='text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/60'>Total saved</p>
      <p className='mt-1.5 text-[2.25rem] font-bold tabular-nums tracking-tight'>{formatUsdcBalance(savings.savedUnits).replace(/ USDC$/, '')} <span className='text-xs font-medium opacity-50'>USDC</span></p>
      <div className='mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4'>
        <Metric label='Ready' value={formatUsdcBalance(savings.withdrawableUnits)} />
        <Metric label='Next release' value={releaseDate(savings.nextRelease)} />
        <Metric label='Network' value='X Layer' />
      </div>
    </section>

    <section className='mt-6'>
      <div className='flex items-center justify-between'><h2 className='text-sm font-black'>Savings networks</h2><span className='text-[10px] font-bold text-zinc-400'>Separate vaults</span></div>
      <div className='mt-3 overflow-hidden rounded-[22px] border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#151515]'>
        <div className='flex items-center gap-3 px-4 py-4'>
          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500'><CircleStackIcon className='h-5 w-5' /></span>
          <span className='min-w-0 flex-1'><span className='block text-sm font-black'>X Layer</span><span className='mt-0.5 block text-[10px] leading-4 text-zinc-500 dark:text-zinc-400'>Save early-pay earnings and native USDC.</span></span>
          <span className='stream-pill'>{savings.depositsEnabled ? 'Available' : savings.configured ? 'Withdraw only' : 'In review'}</span>
        </div>
        <div className='flex items-center gap-3 border-t border-zinc-100 px-4 py-4 dark:border-white/[0.07]'>
          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-white/[0.05]'><CircleStackIcon className='h-5 w-5' /></span>
          <span className='min-w-0 flex-1'><span className='block text-sm font-black'>Arc</span><span className='mt-0.5 block text-[10px] leading-4 text-zinc-500 dark:text-zinc-400'>Save agreement earnings without an automatic bridge.</span></span>
          <span className='rounded-full bg-zinc-100 px-2.5 py-1 text-[9px] font-black text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400'>Coming soon</span>
        </div>
      </div>
    </section>

    {!savings.configured ? <LaunchBoundary unavailable={Boolean(savings.configError)} /> : <>
      {savings.depositsEnabled ? <button type='button' onClick={() => setDepositOpen(true)} className='mt-5 flex w-full items-center justify-between rounded-2xl bg-emerald-500 px-5 py-4 text-left text-emerald-950 shadow-[0_12px_30px_rgba(16,185,129,0.2)] transition active:scale-[0.99]'>
        <span><span className='block text-sm font-black'>Start a savings plan</span><span className='mt-0.5 block text-[11px] font-semibold opacity-70'>Choose weekly or monthly releases</span></span><ChevronRightIcon className='h-5 w-5' />
      </button> : <div className='mt-5 rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3 dark:border-amber-300/15 dark:bg-amber-300/[0.06]'>
        <p className='text-xs font-black text-amber-900 dark:text-amber-100'>New plans are paused</p>
        <p className='mt-1 text-[11px] leading-5 text-amber-800/70 dark:text-amber-100/55'>Existing plans and withdrawals remain available. No new USDC can enter through HashPayStream.</p>
      </div>}
      {savings.configError && <p role='status' className='mt-3 text-center text-[10px] text-zinc-500'>{savings.configError}</p>}
      {savings.savingsError && <p role='alert' className='mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200'>{savings.savingsError}</p>}
      <div className='mt-7 flex items-center justify-between'><h2 className='text-sm font-black'>Your plans</h2><span className='stream-pill'>{savings.plans.filter(plan => plan.remaining > 0n).length} active</span></div>
      <div className='mt-3 space-y-3'>
        {savings.plans.filter(plan => plan.remaining > 0n).map(plan => <SavingsPlanCard key={plan.id} plan={plan} savings={savings} />)}
        {savings.plans.every(plan => plan.remaining === 0n) && <div className='stream-empty py-9'><CalendarDaysIcon className='mx-auto h-7 w-7 text-zinc-400' /><h2 className='mt-3 text-sm font-black'>No active savings plan</h2><p className='mx-auto mt-1.5 max-w-xs text-xs leading-5 text-zinc-500'>Your weekly or monthly plans will appear here.</p></div>}
      </div>
      {depositOpen && <SavingsDepositSheet savings={savings} onClose={() => setDepositOpen(false)} />}
    </>}
  </section>
}

function LaunchBoundary({ unavailable }: { unavailable: boolean }) {
  return <div className='mt-5 rounded-[22px] border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#151515]'>
    <span className='flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500'><ClockIcon className='h-5 w-5' /></span>
    <h2 className='mt-4 text-sm font-black'>{unavailable ? 'Savings setup unavailable' : 'X Layer savings in security review'}</h2>
    <p className='mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400'>{unavailable ? 'HashPayStream could not verify the current savings configuration. New plans remain safely disabled.' : 'New plans stay disabled until the native-USDC vault is independently reviewed, deployed and verified on X Layer.'}</p>
    <div className='mt-4 overflow-hidden rounded-2xl border border-zinc-100 dark:border-white/[0.07]'>
      <div className='px-4 py-3'>
        <p className='text-xs font-black'>Scheduled releases</p>
        <p className='mt-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400'>Set weekly or monthly releases for planned spending.</p>
      </div>
      <div className='border-t border-zinc-100 px-4 py-3 dark:border-white/[0.07]'>
        <div className='flex items-center justify-between gap-3'><p className='text-xs font-black'>Emergency access</p><span className='stream-pill'>48 hours</span></div>
        <p className='mt-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400'>You can request access to all remaining savings, with a fixed 48-hour safety delay.</p>
      </div>
    </div>
    <div className='mt-4 rounded-2xl bg-zinc-50 px-4 py-3 text-[11px] leading-5 text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400'><b className='text-zinc-800 dark:text-zinc-200'>No platform withdrawal access.</b> The reviewed contract must not give HashPayStream an administrator withdrawal or upgrade path.</div>
  </div>
}
