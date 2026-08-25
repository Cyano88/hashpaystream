import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, CheckIcon, ClipboardDocumentIcon, WalletIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useArcWallet } from '../lib/arcWallet'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useStreamAccount } from '../lib/streamAccount'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

export default function StreamPayReceive() {
  const { authenticated } = usePrivy()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const account = useStreamAccount()
  const wallet = useArcWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const homeTo = useStreamPayPath('/home')
  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />

  async function prepare() {
    setBusy(true); setError('')
    try { const walletAddress = await wallet.prepareWallet(); await account.registerWallet(walletAddress); await account.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Your Arc wallet could not be prepared.') }
    finally { setBusy(false) }
  }
  async function copy(value: string, key: string) { if (!value) return; await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(''), 1300) }
  const address = account.profile?.walletAddress || wallet.address

  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3"><Link to={homeTo} aria-label="Back home" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm dark:bg-white/[0.06] dark:text-white"><ArrowLeftIcon className="h-4 w-4" /></Link><div><h1 className="text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">Deposit</h1><p className="text-[11px] text-gray-400">Receive Arc Testnet USDC</p></div></div>
    {!address ? <div className="mt-5 flex min-h-[360px] flex-col items-center justify-center rounded-[26px] border border-gray-100 bg-white px-6 text-center shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10"><WalletIcon className="h-6 w-6" /></span><h2 className="mt-5 text-xl font-extrabold text-gray-950 dark:text-white">Open your Arc wallet</h2><p className="mt-2 max-w-xs text-sm leading-6 text-gray-500 dark:text-gray-400">Set it up once to receive test USDC through your Pocket ID or wallet address.</p><button type="button" disabled={busy} onClick={() => void prepare()} className="mt-6 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy ? 'Opening wallet…' : 'Set up Arc wallet'}</button>{(error || account.error) && <p className="mt-4 text-xs font-semibold text-red-600">{error || account.error}</p>}</div> : <div className="mt-5 space-y-3">
      <div className="rounded-[26px] bg-gray-950 p-5 text-white shadow-[0_18px_48px_rgba(15,23,42,.14)] dark:bg-white dark:text-gray-950"><p className="text-[10px] font-black uppercase tracking-[.18em] opacity-50">Arc wallet balance</p><p className="mt-2 text-3xl font-extrabold tabular-nums">{wallet.loadingBalance ? '—' : wallet.balance} <span className="text-xs opacity-50">USDC</span></p><p className="mt-4 text-[10px] opacity-50">Arc Testnet · test funds only</p></div>
      <ReceiveRow label="Pocket ID" value={account.profile?.pocketId || 'Loading…'} icon={<span className="text-xs font-black">ID</span>} copied={copied === 'id'} onCopy={() => void copy(account.profile?.pocketId || '', 'id')} />
      <ReceiveRow label="Arc address" value={address} mono icon={<WalletIcon className="h-5 w-5" />} copied={copied === 'address'} onCopy={() => void copy(address, 'address')} />
      <p className="px-3 pt-2 text-center text-[11px] leading-5 text-gray-400">Pocket users can send to your ID. Any Arc wallet can send to your address. Only send Arc Testnet USDC.</p>
    </div>}
  </section>
}

function ReceiveRow({ label, value, icon, copied, mono = false, onCopy }: { label: string; value: string; icon: React.ReactNode; copied: boolean; mono?: boolean; onCopy: () => void }) {
  return <button type="button" onClick={onCopy} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.07]">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span><span className={`mt-1 block truncate text-sm font-black text-gray-950 dark:text-white ${mono ? 'font-mono text-xs' : 'tabular-nums'}`}>{value}</span></span>{copied ? <CheckIcon className="h-5 w-5 text-emerald-500" /> : <ClipboardDocumentIcon className="h-5 w-5 text-gray-400" />}</button>
}
