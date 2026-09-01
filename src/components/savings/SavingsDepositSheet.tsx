import { useEffect, useMemo, useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { createPublicClient, createWalletClient, custom, formatEther, getAddress, http, parseEventLogs, parseUnits } from 'viem'
import { upfrontXLayerChain } from '../../lib/upfrontChains'
import { formatUsdcBalance } from '../../lib/useAgreements'
import { MONTHLY_SECONDS, SAVINGS_VAULT_ABI, WEEKLY_SECONDS, type useSavingsVault } from '../../lib/useSavingsVault'
import { XLAYER_USDC_ADDRESS } from '../../lib/useXLayerUsdcBalance'
import { savingsPlanPreview } from '../../lib/savingsSchedule'

const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

type SavingsState = ReturnType<typeof useSavingsVault>
class SavingsUiError extends Error {}

function actionError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  const code = typeof reason === 'object' && reason !== null && 'code' in reason ? String((reason as { code?: unknown }).code ?? '') : ''
  if (code === '4001' || ['user rejected', 'user denied', 'request rejected'].some(value => message.toLowerCase().includes(value))) return 'Transaction cancelled. No funds moved.'
  return 'The savings plan could not be created. No funds moved.'
}

function cleanAmount(value: string) {
  const next = value.replace(/[^\d.]/g, '')
  return /^\d*(?:\.\d{0,6})?$/.test(next) ? next : value
}

export default function SavingsDepositSheet({ savings, onClose }: { savings: SavingsState; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [releaseAmount, setReleaseAmount] = useState('')
  const [cadence, setCadence] = useState<'weekly' | 'monthly'>('weekly')
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const interval = cadence === 'weekly' ? WEEKLY_SECONDS : MONTHLY_SECONDS
  const preview = useMemo(() => {
    try {
      if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || !/^\d+(?:\.\d{1,6})?$/.test(releaseAmount)) return undefined
      return savingsPlanPreview(parseUnits(amount, 6), parseUnits(releaseAmount, 6), interval)
    } catch {
      return undefined
    }
  }, [amount, interval, releaseAmount])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !stage) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, stage])

  async function createPlan() {
    setStage('Checking savings plan...'); setError('')
    let transactionConfirmed = false
    try {
      if (!savings.wallet || !savings.address || !savings.vaultAddress) throw new SavingsUiError('Your X Layer wallet is not ready.')
      if (!savings.depositsEnabled) throw new SavingsUiError('New savings plans are currently paused.')
      if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || !/^\d+(?:\.\d{1,6})?$/.test(releaseAmount)) throw new SavingsUiError('Enter a valid USDC amount.')
      const units = parseUnits(amount, 6)
      const releaseUnits = parseUnits(releaseAmount, 6)
      if (units <= 0n || releaseUnits <= 0n || releaseUnits > units) throw new SavingsUiError('The release amount must be greater than zero and no more than the amount saved.')
      if (savings.units === undefined || units > savings.units) throw new SavingsUiError('Your X Layer USDC balance is too low.')
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const gasPrice = await client.getGasPrice()
      const gasBalance = await client.getBalance({ address: savings.address })
      const gasReserve = gasPrice * 350_000n
      if (gasBalance < gasReserve) throw new SavingsUiError(`You need about ${formatEther(gasReserve)} OKB for X Layer gas.`)
      await savings.wallet.switchChain(upfrontXLayerChain.id)
      const walletClient = createWalletClient({ account: savings.address, chain: upfrontXLayerChain, transport: custom(await savings.wallet.getEthereumProvider()) })
      const allowance = await client.readContract({ address: XLAYER_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [savings.address, savings.vaultAddress] })
      if (allowance < units) {
        setStage('Approve USDC - Step 1 of 2')
        const approval = await client.simulateContract({ account: savings.address, address: XLAYER_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [savings.vaultAddress, units] })
        const hash = await walletClient.writeContract(approval.request)
        const receipt = await client.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('USDC approval reverted.')
      }
      setStage('Start savings - Step 2 of 2')
      const plan = await client.simulateContract({ account: savings.address, address: savings.vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'createPlan', args: [units, interval, releaseUnits] })
      const hash = await walletClient.writeContract(plan.request)
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Savings transaction reverted.')
      transactionConfirmed = true
      const created = parseEventLogs({ abi: SAVINGS_VAULT_ABI, logs: receipt.logs, eventName: 'PlanCreated' })
        .find(event => event.args.owner && getAddress(event.args.owner) === savings.address)
      if (!created || created.args.amount !== units || created.args.releaseAmount !== releaseUnits || created.args.interval !== interval) {
        throw new Error('Savings confirmation did not match the reviewed plan.')
      }
      await Promise.all([savings.refresh(), savings.refreshSavings()])
      setComplete(true); setStage('')
    } catch (reason) {
      setStage('')
      if (transactionConfirmed) {
        await Promise.allSettled([savings.refresh(), savings.refreshSavings()])
        setError('Your transaction confirmed, but the plan update could not be verified. Check your savings before trying again.')
      } else {
        setError(reason instanceof SavingsUiError ? reason.message : actionError(reason))
      }
    }
  }

  return <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm' role='dialog' aria-modal='true' aria-labelledby='savings-sheet-title'>
    <button type='button' aria-label='Close savings form' className='absolute inset-0' onClick={stage ? undefined : onClose} />
    <section className='relative z-10 w-full max-w-md rounded-t-[28px] border border-white/10 bg-[#111111] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-white shadow-2xl'>
      <span className='mx-auto block h-1 w-10 rounded-full bg-white/20' />
      {complete ? <div className='py-10 text-center'>
        <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400'><CheckIcon className='h-7 w-7' /></span>
        <h2 id='savings-sheet-title' className='mt-5 text-xl font-black'>Savings plan started</h2>
        <p className='mt-2 text-xs leading-5 text-white/50'>Your first release becomes available after one {cadence === 'weekly' ? 'week' : 'month'}.</p>
        <button type='button' onClick={onClose} className='mt-7 w-full rounded-full bg-white px-5 py-3.5 text-sm font-black text-black'>Done</button>
      </div> : <>
        <div className='mt-5 flex items-start justify-between gap-4'><div><h2 id='savings-sheet-title' className='text-lg font-black'>Start saving</h2><p className='mt-1 text-[11px] text-white/45'>Native USDC on X Layer</p></div><img src='/brand/usdc-token.svg' alt='USDC' className='h-10 w-10 object-contain' /></div>
        <label className='mt-6 block'><span className='flex items-center justify-between text-[11px] font-bold text-white/55'><span>Amount to save</span><button type='button' onClick={() => setAmount(savings.balance)} className='text-emerald-400'>MAX</button></span><span className='mt-2 flex items-center border-b border-white/15'><span className='text-2xl font-black text-white/35'>$</span><input inputMode='decimal' value={amount} onChange={event => { setAmount(cleanAmount(event.target.value)); setError('') }} placeholder='0.00' className='min-w-0 flex-1 bg-transparent px-2 py-3 text-3xl font-black outline-none' /><b className='text-xs text-white/35'>USDC</b></span></label>
        <p className='mt-2 text-[10px] text-white/35'>Available {savings.units === undefined ? '0 USDC' : formatUsdcBalance(savings.units)}</p>
        <div className='mt-6'><p className='text-[11px] font-bold text-white/55'>Release schedule</p><div className='mt-2 grid grid-cols-2 rounded-full bg-white/[0.06] p-1'>{(['weekly', 'monthly'] as const).map(value => <button key={value} type='button' onClick={() => setCadence(value)} className={`rounded-full px-4 py-2.5 text-xs font-black capitalize transition ${cadence === value ? 'bg-white text-black' : 'text-white/45'}`}>{value}</button>)}</div></div>
        <label className='mt-5 block'><span className='text-[11px] font-bold text-white/55'>Release each {cadence === 'weekly' ? 'week' : 'month'}</span><span className='mt-2 flex items-center rounded-2xl border border-white/10 bg-white/[0.035] px-4'><input inputMode='decimal' value={releaseAmount} onChange={event => { setReleaseAmount(cleanAmount(event.target.value)); setError('') }} placeholder='0.00' className='min-w-0 flex-1 bg-transparent py-3.5 text-sm font-black outline-none' /><b className='text-xs text-white/35'>USDC</b></span></label>
        {preview && <div className='mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-3'>
          <PreviewMetric label='First release' value={shortDate(preview.firstReleaseAt)} />
          <PreviewMetric label='Releases' value={String(preview.releases)} />
          <PreviewMetric label='Final release' value={shortDate(preview.finalReleaseAt)} />
        </div>}
        {preview && preview.finalReleaseAmount !== parseUnits(releaseAmount, 6) && <p className='mt-2 text-center text-[9px] text-white/35'>Final release: {formatUsdcBalance(preview.finalReleaseAmount)}</p>}
        <div className='mt-5 rounded-2xl bg-white/[0.045] px-4 py-3 text-[10px] leading-5 text-white/40'>This vault holds USDC; it does not generate yield. Emergency access has a 48-hour delay.</div>
        {error && <p role='alert' className='mt-4 rounded-xl bg-red-400/10 px-3 py-2.5 text-xs font-semibold text-red-200'>{error}</p>}
        <button type='button' disabled={Boolean(stage) || !preview || !savings.depositsEnabled} onClick={() => void createPlan()} className='mt-5 w-full rounded-full bg-emerald-500 px-5 py-4 text-sm font-black text-emerald-950 disabled:opacity-35'>{stage || 'Review and start saving'}</button>
        <p className='mt-3 text-center text-[9px] leading-4 text-white/30'>The first plan may require one exact USDC approval. HashPayStream cannot withdraw your savings.</p>
      </>}
    </section>
  </div>
}

function shortDate(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value * 1000))
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return <div className='min-w-0 text-center'><p className='text-[8px] font-bold uppercase tracking-[0.1em] text-white/35'>{label}</p><p className='mt-1 truncate text-[10px] font-black text-white/80'>{value}</p></div>
}
