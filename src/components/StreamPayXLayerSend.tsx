import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { createPublicClient, createWalletClient, custom, formatEther, formatUnits, getAddress, http, isAddress, parseUnits, zeroAddress } from 'viem'
import { withPaymentSubmission } from '../lib/walletTransfer'
import { usePocketTransfers } from '../lib/pocketTransfers'
import { Link } from '../lib/router'
import { upfrontXLayerChain } from '../lib/upfrontChains'
import { XLAYER_USDC_ADDRESS, useXLayerUsdcBalance } from '../lib/useXLayerUsdcBalance'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { formatUsdcBalance } from '../lib/useAgreements'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

const ERC20_ABI = [{
  type: 'function', name: 'transfer', stateMutability: 'nonpayable',
  inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }],
}] as const

export default function StreamPayXLayerSend() { const { user } = usePrivy(); return <SendForm key={user?.id ?? 'signed-out'} /> }

function SendForm() {
  const { authenticated } = usePrivy()
  const wallet = useXLayerUsdcBalance()
  const transfers = usePocketTransfers()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const submitting = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const scope = wallet.address ? { chainId: upfrontXLayerChain.id, owner: wallet.address, asset: XLAYER_USDC_ADDRESS } : undefined
  const available = scope ? transfers.available(scope, wallet.units ?? 0n) : 0n
  const moveTo = useStreamPayPath('/move')
  const homeTo = useStreamPayPath('/home')

  if (!authenticated) return <AgreementSignInLanding />

  async function send() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true); setError('')
    try {
      if (!scope) throw new Error('Your X Layer wallet is not ready.')
      if (!/^\d+(?:\.\d{1,6})?$/.test(amount)) throw new Error('Enter a valid USDC amount.')
      if (!wallet.wallet || !wallet.address) throw new Error('Your X Layer wallet is not ready.')
      if (!isAddress(recipient) || getAddress(recipient) === zeroAddress) throw new Error('Enter a valid X Layer wallet address.')
      const units = parseUnits(amount, 6)
      if (units <= 0n) throw new Error('Enter an amount greater than zero.')
      if (wallet.units === undefined || units > available) throw new Error('Your X Layer USDC balance is too low.')
      await wallet.wallet.switchChain(upfrontXLayerChain.id)
      const account = wallet.address
      const publicClient = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const walletClient = createWalletClient({ account, chain: upfrontXLayerChain, transport: custom(await wallet.wallet.getEthereumProvider()) })
      const simulation = await publicClient.simulateContract({ account, address: XLAYER_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'transfer', args: [getAddress(recipient), units] })
      const [gas, gasPrice, gasBalance] = await Promise.all([
        publicClient.estimateContractGas(simulation.request), publicClient.getGasPrice(), publicClient.getBalance({ address: account }),
      ])
      const requiredGas = gas * gasPrice
      if (gasBalance < requiredGas) throw new Error(`You need about ${formatEther(requiredGas)} OKB for X Layer gas.`)
      if (!transfers.ready) throw Error('Wait for your pending payments to load.')
      const operation = await transfers.begin(scope, { recipient: getAddress(recipient), units: units.toString() })
      if (!active.current) throw Error('Your wallet account changed. Reopen Pocket to continue.')
      await withPaymentSubmission(operation.transfer.id, async () => {
      const attemptKey = 'hashpaystream:xlayer-attempt:' + operation.transfer.id
      if (operation.transfer.hash || localStorage.getItem(attemptKey)) {
        operation.releaseDraft()
        setNotice('Your previous payment is in Activity. You can start another transfer.')
      } else {
        localStorage.setItem(attemptKey, 'submitted')
        let hash
        try { hash = await walletClient.writeContract(simulation.request) }
        catch (error) {
          let cause: unknown = error, rejected = false
          for (let depth = 0; depth < 6 && cause && typeof cause === 'object'; depth++) { if ('code' in cause && cause.code === 4001) rejected = true; cause = 'cause' in cause ? cause.cause : undefined }
          if (rejected) { await transfers.cancelUnsubmitted(operation.transfer.id); operation.releaseDraft(); localStorage.removeItem(attemptKey) }
          else { try { await transfers.track(operation.transfer.id, { accepted: true }) } catch { /* Preserve uncertain submission for review. */ } }
          throw error
        }
        operation.releaseDraft()
        setNotice('Transfer processing. Follow its progress in Activity.')
        try { await transfers.track(operation.transfer.id, { hash, accepted: true }) } catch { /* Status outbox retries without resending. */ }
      }
      })
      setAmount(''); setRecipient('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'X Layer USDC could not be sent.')
    } finally { submitting.current = false; setBusy(false) }
  }

  return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3"><Link to={moveTo} aria-label="Back to Move" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link><div><h1 className="text-xl font-extrabold tracking-tight">Send X Layer USDC</h1><p className="text-[11px] text-gray-400">From your early-pay wallet</p></div></div>
    <div className="stream-card mt-5 space-y-4 p-5">
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]"><span className="text-xs font-semibold text-gray-500">Available</span><span className="text-sm font-black tabular-nums">{wallet.balanceReady && wallet.units !== undefined ? formatUsdcBalance(available) : 'Checking…'}</span></div>
      <label className="block"><span className="text-[11px] font-bold text-gray-500">Recipient X Layer address</span><input value={recipient} onChange={event => { setRecipient(event.target.value.trim()); setError('') }} placeholder="0x…" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3.5 font-mono text-xs outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/[0.04]" /></label>
      <label className="block"><span className="flex items-center justify-between text-[11px] font-bold text-gray-500"><span>Amount</span><button type="button" onClick={() => setAmount(formatUnits(available, 6))} className="text-emerald-600">Max</button></span><span className="mt-2 flex items-center rounded-2xl border border-gray-200 px-4 dark:border-white/10"><input inputMode="decimal" value={amount} onChange={event => { const next = event.target.value.replace(/[^\d.]/g, ''); if (/^\d*(?:\.\d{0,6})?$/.test(next)) setAmount(next); setError('') }} placeholder="0.00" className="min-w-0 flex-1 bg-transparent py-4 text-base font-bold outline-none" /><b className="text-xs text-gray-400">USDC</b></span></label>
      {notice && <p role="status" className="text-xs font-semibold text-blue-600">{notice} <Link to={homeTo.replace('/home', '/activity')} className="underline">Activity</Link></p>}
      {(error || wallet.error || transfers.error) && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{error || wallet.error || transfers.error}</p>}
      <button type="button" disabled={busy || !transfers.ready || !amount || !isAddress(recipient) || getAddress(recipient) === zeroAddress || !wallet.balanceReady} onClick={() => void send()} className="w-full rounded-full bg-gray-950 px-5 py-4 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Confirming on X Layer…' : 'Review and send'}</button>
      <p className="text-center text-[10px] leading-4 text-gray-400">You approve the transfer from your HashPayStream wallet. X Layer requires a small OKB gas balance.</p>
    </div>
  </section>
}
