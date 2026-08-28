import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { getAddress, isAddress, parseUnits } from 'viem'
import { Link } from '../lib/router'
import { useCircleWallet } from '../lib/circleWallet'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useStreamAccount } from '../lib/streamAccount'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

type Mode = 'pocket' | 'address'

export default function StreamPaySend() {
  const { authenticated } = usePrivy()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const account = useStreamAccount()
  const wallet = useCircleWallet()
  const [mode, setMode] = useState<Mode>('pocket')
  const [pocketId, setPocketId] = useState('')
  const [address, setAddress] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hash, setHash] = useState('')
  const homeTo = useStreamPayPath('/home')
  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />

  async function resolve() {
    setError(''); setResolvedName('')
    try {
      const recipient = await account.resolvePocketId(pocketId)
      setAddress(recipient.walletAddress); setResolvedName(recipient.displayName)
    } catch (reason) { setAddress(''); setError(reason instanceof Error ? reason.message : 'Pocket ID was not found.') }
  }

  async function send() {
    setBusy(true); setError(''); setHash('')
    try {
      const recipient = address.trim()
      if (!isAddress(recipient)) throw new Error(mode === 'pocket' ? 'Verify the Pocket ID first.' : 'Enter a valid Arc wallet address.')
      const units = parseUnits(amount, 6)
      if (units <= 0n) throw new Error('Enter an amount greater than zero.')
      if (!wallet.session) throw new Error('Your Circle wallet is not ready.')
      const txHash = await wallet.sendUsdc(getAddress(recipient), amount)
      setHash(txHash)
      window.localStorage.setItem('hashpaystream.pendingArcTransfer', txHash)
      try { await account.recordTransfer(txHash); window.localStorage.removeItem('hashpaystream.pendingArcTransfer') } catch { /* Activity retries this confirmed hash */ }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Arc USDC could not be sent.') } finally { setBusy(false) }
  }

  if (hash) return <section className="flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center py-8 text-center"><CheckCircleIcon className="h-14 w-14 text-emerald-500" /><h1 className="mt-5 text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white">USDC sent</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your Arc transfer is confirmed.</p><a href={`https://testnet.arcscan.app/tx/${hash}`} target="_blank" rel="noreferrer" className="mt-5 text-xs font-bold text-blue-600">View on Arcscan</a><Link to={homeTo} className="mt-6 w-full rounded-full bg-gray-950 px-5 py-3.5 text-sm font-bold text-white dark:bg-white dark:text-gray-950">Done</Link></section>

  return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3"><Link to={homeTo} aria-label="Back home" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link><div><h1 className="text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">Send Arc USDC</h1><p className="text-[11px] text-gray-400">Arc Testnet</p></div></div>
    <div className="stream-card mt-5 space-y-4 p-5">
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]"><span className="text-xs font-semibold text-gray-500">Available</span><span className="text-sm font-black tabular-nums">{wallet.loadingBalance ? 'Checking…' : `${wallet.balance} USDC`}</span></div>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.06]">{(['pocket', 'address'] as Mode[]).map(value => <button key={value} type="button" onClick={() => { setMode(value); setAddress(''); setResolvedName(''); setError('') }} className={`min-h-10 rounded-full text-xs font-bold ${mode === value ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 dark:text-gray-400'}`}>{value === 'pocket' ? 'Pocket ID' : 'Wallet address'}</button>)}</div>
      {mode === 'pocket' ? <label className="block"><span className="text-[11px] font-bold text-gray-500">Recipient Pocket ID</span><div className="mt-2 flex gap-2"><input inputMode="numeric" value={pocketId} onChange={event => { setPocketId(event.target.value.replace(/\D/g, '').slice(0, 10)); setAddress(''); setResolvedName('') }} placeholder="10-digit ID" className="min-w-0 flex-1 rounded-2xl border border-gray-200 px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" /><button type="button" disabled={pocketId.length !== 10 || busy} onClick={() => void resolve()} className="rounded-2xl bg-gray-100 px-4 text-xs font-bold text-gray-700 disabled:opacity-40 dark:bg-white/[0.08] dark:text-white">Verify</button></div>{resolvedName && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircleIcon className="h-4 w-4" />{resolvedName}</p>}</label> : <label className="block"><span className="text-[11px] font-bold text-gray-500">Recipient Arc address</span><input value={address} onChange={event => setAddress(event.target.value.trim())} placeholder="0x…" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3.5 font-mono text-xs outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" /></label>}
      <label className="block"><span className="flex items-center justify-between text-[11px] font-bold text-gray-500"><span>Amount</span><button type="button" onClick={() => setAmount(wallet.balance)} className="text-blue-600">Max</button></span><span className="mt-2 flex items-center rounded-2xl border border-gray-200 px-4 dark:border-white/10"><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" className="min-w-0 flex-1 bg-transparent py-4 text-base font-bold outline-none" /><b className="text-xs text-gray-400">USDC</b></span></label>
      {(error || account.error) && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{error || account.error}</p>}
      <button type="button" disabled={busy || !amount || !address} onClick={() => void send()} className="w-full rounded-full bg-gray-950 px-5 py-4 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Confirming on Arc…' : 'Confirm send'}</button>
      <p className="text-center text-[10px] leading-4 text-gray-400">Circle will ask you to approve before test USDC moves.</p>
    </div>
  </section>
}
