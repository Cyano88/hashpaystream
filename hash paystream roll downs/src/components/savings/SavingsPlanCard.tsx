import { useRef, useState } from 'react'
import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { SAVINGS_USDC_ADDRESS, savingsChain } from '../../lib/savingsChain'
import { formatUsdcBalance } from '../../lib/useAgreements'
import { nextSavingsRelease, SAVINGS_VAULT_ABI, WEEKLY_SECONDS, type SavingsPlan, type useSavingsVault } from '../../lib/useSavingsVault'

import { SavingsTransactionError, readSavingsTransaction, runSavingsTransaction, type SavingsIntent } from '../../lib/savingsTransaction'

type SavingsState = ReturnType<typeof useSavingsVault>

function dateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value * 1000))
}

function shortDate(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value * 1000))
}

function safeError(reason: unknown) {
  if (reason instanceof SavingsTransactionError) return reason.message
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  const code = typeof reason === 'object' && reason !== null && 'code' in reason ? String((reason as { code?: unknown }).code ?? '') : ''
  if (code === '4001' || message.toLowerCase().includes('user rejected')) return 'Transaction cancelled. No funds moved.'
  return 'The transaction could not be verified. Check your wallet and savings before trying again.'
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
    try {
      if (!savings.address || !savings.vaultAddress) throw new Error('Your Arc wallet is not ready.')
      const scope = { chainId: savingsChain.id, owner: savings.address, vault: savings.vaultAddress, asset: SAVINGS_USDC_ADDRESS }
      const client = createPublicClient({ chain: savingsChain, transport: http() })
      const intent: SavingsIntent = { action, planId: plan.id, ...(['withdraw', 'completeEmergencyExit'].includes(action) ? { amount: String(action === 'withdraw' ? plan.withdrawable : plan.remaining) } : {}) }
      const prior = readSavingsTransaction(scope)
      await runSavingsTransaction(scope, prior?.intent ?? intent, async () => {
        if (!savings.wallet) throw new Error('Your Arc wallet is not ready.')
        await savings.wallet.switchChain(savingsChain.id)
        const walletClient = createWalletClient({ account: scope.owner, chain: savingsChain, transport: custom(await savings.wallet.getEthereumProvider()) })
        if (action === 'withdraw') {
          const simulation = await client.simulateContract({ account: scope.owner, address: scope.vault, abi: SAVINGS_VAULT_ABI, functionName: 'withdraw', args: [plan.id, plan.withdrawable] })
          return walletClient.writeContract(simulation.request)
        }
        const simulation = await client.simulateContract({ account: scope.owner, address: scope.vault, abi: SAVINGS_VAULT_ABI, functionName: action, args: [plan.id] })
        return walletClient.writeContract(simulation.request)
      }, (hash, onReplacement) => client.waitForTransactionReceipt({ hash, timeout: 60_000, confirmations: 2, onReplaced: ({ reason, transaction }) => onReplacement({ hash: transaction.hash, reason }) }))
      await Promise.allSettled([savings.refresh(), savings.refreshSavings()])
    } catch (reason) {
      setError(safeError(reason))
    } finally {
      actionPending.current = false
      setStage('')
      void savings.refreshSavings()
    }
  }

  return <article className='rounded-[22px] border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-[#151515]'>
    <div className='flex items-start justify-between gap-4'><div><p className='text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600'>{plan.interval === WEEKLY_SECONDS ? 'Every 7 days' : 'Every 30 days'}</p><p className='mt-1 text-xl font-black tabular-nums'>{formatUsdcBalance(plan.remaining)}</p><p className='mt-0.5 text-[10px] font-bold text-zinc-400'>Remaining</p></div><span className='stream-pill'>{plan.withdrawable > 0n ? 'Available' : 'Saving'}</span></div>
    <div className='mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-white/[0.035]'>
      <div><p className='text-[10px] font-bold text-zinc-400'>Each release</p><p className='mt-1 text-xs font-black'>{formatUsdcBalance(plan.releaseAmount)}</p></div>
      <div><p className='text-[10px] font-bold text-zinc-400'>Available now</p><p className='mt-1 text-xs font-black'>{formatUsdcBalance(plan.withdrawable)}</p></div>
      <div><p className='text-[10px] font-bold text-zinc-400'>Next release</p><p className='mt-1 text-xs font-black'>{nextRelease ? shortDate(nextRelease) : 'Complete'}</p></div>
    </div>
    {plan.withdrawable > 0n && <button type='button' disabled={Boolean(stage) || savings.hasPendingTransaction} onClick={() => void act('withdraw')} className='mt-3 w-full rounded-full bg-emerald-500 px-4 py-3 text-xs font-black text-emerald-950 disabled:opacity-40'>{stage === 'withdraw' ? 'Withdrawing...' : `Withdraw ${formatUsdcBalance(plan.withdrawable)}`}</button>}
    {plan.emergencyExitAt === 0 ? <button type='button' disabled={Boolean(stage) || savings.hasPendingTransaction} onClick={() => void act('requestEmergencyExit')} className='mt-3 w-full rounded-full px-4 py-2 text-[11px] font-bold text-zinc-400 transition active:bg-zinc-100 disabled:opacity-40 dark:active:bg-white/[0.04]'>{stage === 'requestEmergencyExit' ? 'Requesting early access...' : 'Need all savings early?'}</button> : emergencyReady ? <button type='button' disabled={Boolean(stage) || savings.hasPendingTransaction} onClick={() => void act('completeEmergencyExit')} className='mt-3 w-full rounded-full border border-amber-400/30 px-4 py-3 text-xs font-black text-amber-600 disabled:opacity-40'>{stage === 'completeEmergencyExit' ? 'Withdrawing...' : 'Withdraw all savings'}</button> : <div className='mt-3 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-3 py-2.5 text-[10px] text-amber-700 dark:bg-amber-400/[0.07] dark:text-amber-400'><span>Available {dateTime(plan.emergencyExitAt)}</span><button type='button' disabled={Boolean(stage) || savings.hasPendingTransaction} onClick={() => void act('cancelEmergencyExit')} className='font-black'>{stage === 'cancelEmergencyExit' ? 'Cancelling...' : 'Cancel request'}</button></div>}
    {error && <p role='alert' className='mt-3 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200'>{error}</p>}
  </article>
}
