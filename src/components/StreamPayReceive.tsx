import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, CheckIcon, ClipboardDocumentIcon, WalletIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useCircleWallet } from '../lib/circleWallet'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useStreamAccount } from '../lib/streamAccount'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

export default function StreamPayReceive() {
  const { authenticated } = usePrivy()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const account = useStreamAccount()
  const wallet = useCircleWallet()
  const [copied, setCopied] = useState('')
  const homeTo = useStreamPayPath('/home')
  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  async function copy(value: string, key: string) { if (!value) return; await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(''), 1300) }
  const address = wallet.address
  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3"><Link to={homeTo} aria-label="Back home" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm dark:bg-white/[0.06] dark:text-white"><ArrowLeftIcon className="h-4 w-4" /></Link><div><h1 className="text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">Deposit</h1><p className="text-[11px] text-gray-400">Receive USDC</p></div></div>
    <div className="mt-5 space-y-3">
      <div className="rounded-[26px] bg-gray-950 p-5 text-white shadow-[0_18px_48px_rgba(15,23,42,.14)] dark:bg-white dark:text-gray-950"><p className="text-[10px] font-black uppercase tracking-[.18em] opacity-50">Available balance</p><p className="mt-2 text-3xl font-extrabold tabular-nums">{wallet.loadingBalance ? '—' : wallet.balance} <span className="text-xs opacity-50">USDC</span></p><p className="mt-4 text-[10px] opacity-50">Circle wallet</p></div>
      <ReceiveRow label="Pocket ID" value={account.profile?.pocketId || 'Loading…'} icon={<span className="text-xs font-black">ID</span>} copied={copied === 'id'} onCopy={() => void copy(account.profile?.pocketId || '', 'id')} />
      <ReceiveRow label="Wallet address" value={address} mono icon={<WalletIcon className="h-5 w-5" />} copied={copied === 'address'} onCopy={() => void copy(address, 'address')} />
      <p className="px-3 pt-2 text-center text-[11px] leading-5 text-gray-400">Pocket users can send to your ID. Other users can send Arc USDC to your wallet address.</p>
      {account.error && <p className="px-3 text-center text-xs font-semibold text-red-600">{account.error}</p>}
    </div>
  </section>
}

function ReceiveRow({ label, value, icon, copied, mono = false, onCopy }: { label: string; value: string; icon: React.ReactNode; copied: boolean; mono?: boolean; onCopy: () => void }) {
  return <button type="button" onClick={onCopy} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-white/[0.07]">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span><span className={`mt-1 block truncate text-sm font-black text-gray-950 dark:text-white ${mono ? 'font-mono text-xs' : 'tabular-nums'}`}>{value}</span></span>{copied ? <CheckIcon className="h-5 w-5 text-emerald-500" /> : <ClipboardDocumentIcon className="h-5 w-5 text-gray-400" />}</button>
}
