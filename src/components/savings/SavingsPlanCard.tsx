import { useRef, useState } from 'react'
import { createPublicClient, createWalletClient, custom, getAddress, http, parseEventLogs, type Hex } from 'viem'
import { upfrontXLayerChain } from '../../lib/upfrontChains'
import { formatUsdcBalance } from '../../lib/useAgreements'
import { nextSavingsRelease, SAVINGS_VAULT_ABI, WEEKLY_SECONDS, type SavingsPlan, type useSavingsVault } from '../../lib/useSavingsVault'

type SavingsState = ReturnType<typeof useSavingsVault>

function dateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value * 1000))
}

function safeError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  const code = typeof reason === 'object' && reason !== null && 'code' in reason ? String((reason as { code?: unknown }).code ?? '') : ''
  if (code === '4001' || message.toLowerCase().includes('user rejected')) return 'Transaction cancelled. No funds moved.'
  return 'Savings could not be updated. No funds moved.'
}

export default function SavingsPlanCard({ plan, savings }: { plan: SavingsPlan; savings: SavingsState }) {
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const actionPending = useRef(false)
  const nextRelease = nextSavingsRelease(plan)
  const emergencyReady = plan.emergencyExitAt > 0 && plan.emergencyExitAt <= Math.floor(Date.now() / 1000)

  async function act(action: 'withdraw' | 'requestEmergencyExit' | 'cancelEmergencyExit' | 'completeEmergencyExit') {
    if (actionPending.current) return
    actionPending.current = true
    setStage(action); setError('')
    let transactionConfirmed = false
    try {
      if (!savings.wallet || !savings.address || !savings.vaultAddress) throw new Error('Your X Layer wallet is not ready.')
      await savings.wallet.switchChain(upfrontXLayerChain.id)
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const walletClient = createWalletClient({ account: savings.address, chain: upfrontXLayerChain, transport: custom(await savings.wallet.getEthereumProvider()) })
      let hash: Hex
      if (action === 'withdraw') {
        const simulation = await client.simulateContract({ account: savings.address, address: savings.vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'withdraw', args: [plan.id, plan.withdrawable] })
        hash = await walletClient.writeContract(simulation.request)
      } else if (action === 'requestEmergencyExit') {
        const simulation = await client.simulateContract({ account: savings.address, address: savings.vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'requestEmergencyExit', args: [plan.id] })
        hash = await walletClient.writeContract(simulation.request)
      } else if (action === 'cancelEmergencyExit') {
        const simulation = await client.simulateContract({ account: savings.address, address: savings.vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'cancelEmergencyExit', args: [plan.id] })
        hash = await walletClient.writeContract(simulation.request)
      } else {
        const simulation = await client.simulateContract({ account: savings.address, address: savings.vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'completeEmergencyExit', args: [plan.id] })
        hash = await walletClient.writeContract(simulation.request)
      }
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Savings transaction reverted.')
      transactionConfirmed = true
      const eventName = action === 'withdraw'
        ? 'SavingsWithdrawn'
        : action === 'requestEmergencyExit'
          ? 'EmergencyExitRequested'
          : action === 'cancelEmergencyExit'
            ? 'EmergencyExitCancelled'
            : 'EmergencyExitCompleted'
      const confirmed = parseEventLogs({ abi: SAVINGS_VAULT_ABI, logs: receipt.logs, eventName })
        .some(event => event.args.planId === plan.id && event.args.owner && getAddress(event.args.owner) === savings.address)
      if (!confirmed) throw new Error('Savings confirmation did not match this plan.')
      await Promise.all([savings.refresh(), savings.refreshSavings()])
    } catch (reason) {
      if (transactionConfirmed) {
        await Promise.allSettled([savings.refresh(), savings.refreshSavings()])
        setError('Your transaction confirmed, but the plan update could not be verified. Check your savings before trying again.')
      } else {
        setError(safeError(reason))
      }
    } finally {
      actionPending.current = false
      setStage('')
    }
  }

  return <article className='rounded-[22px] border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-[#151515]'>
    <div className='flex items-start justify-between gap-4'><div><p className='text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600'>{plan.interval === WEEKLY_SECONDS ? 'Weekly savings' : 'Monthly savings'}</p><p className='mt-1 text-xl font-black tabular-nums'>{formatUsdcBalance(plan.remaining)}</p><p className='mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400'>Remaining</p></div><span className='stream-pill'>{plan.withdrawable > 0n ? 'Ready' : 'Saving'}</span></div>
    <div className='mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-white/[0.035]'>
      <div><p className='text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400'>Release</p><p className='mt-1 text-xs font-black'>{formatUsdcBalance(plan.releaseAmount)}</p></div>
      <div><p className='text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400'>Available</p><p className='mt-1 text-xs font-black'>{formatUsdcBalance(plan.withdrawable)}</p></div>
      <div><p className='text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400'>Next</p><p className='mt-1 text-xs font-black'>{nextRelease ? dateTime(nextRelease) : 'Complete'}</p></div>
    </div>
    {plan.withdrawable > 0n && <button type='button' disabled={Boolean(stage)} onClick={() => void act('withdraw')} className='mt-3 w-full rounded-full bg-emerald-500 px-4 py-3 text-xs font-black text-emerald-950 disabled:opacity-40'>{stage === 'withdraw' ? 'Withdrawing...' : `Withdraw ${formatUsdcBalance(plan.withdrawable)}`}</button>}
    {plan.emergencyExitAt === 0 ? <button type='button' disabled={Boolean(stage)} onClick={() => void act('requestEmergencyExit')} className='mt-3 w-full py-1 text-[10px] font-bold text-zinc-400 underline underline-offset-4'>{stage === 'requestEmergencyExit' ? 'Requesting...' : 'Need all savings early?'}</button> : emergencyReady ? <button type='button' disabled={Boolean(stage)} onClick={() => void act('completeEmergencyExit')} className='mt-3 w-full rounded-full border border-amber-400/30 px-4 py-3 text-xs font-black text-amber-600 disabled:opacity-40'>{stage === 'completeEmergencyExit' ? 'Withdrawing...' : 'Withdraw all savings'}</button> : <div className='mt-3 flex items-center justify-between gap-3 text-[10px] text-amber-600'><span>Early access {dateTime(plan.emergencyExitAt)}</span><button type='button' disabled={Boolean(stage)} onClick={() => void act('cancelEmergencyExit')} className='font-black underline underline-offset-2'>{stage === 'cancelEmergencyExit' ? 'Cancelling...' : 'Cancel'}</button></div>}
    {error && <p role='alert' className='mt-3 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200'>{error}</p>}
  </article>
}
