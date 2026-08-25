import { useState } from 'react'
import { ArrowRightStartOnRectangleIcon, BanknotesIcon, CheckIcon, ClipboardDocumentIcon, MoonIcon, SunIcon, WalletIcon } from '@heroicons/react/24/outline'
import { usePrivy } from '@privy-io/react-auth'
import { Link } from '../lib/router'
import { useTheme } from '../lib/ThemeContext'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useStreamAccount } from '../lib/streamAccount'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

export default function StreamPayAccount() {
  const { authenticated, user, logout } = usePrivy()
  const { theme, toggle } = useTheme()
  const account = useStreamAccount()
  const [copied, setCopied] = useState('')
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const fundingTo = useStreamPayPath('/funding')
  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  const email = account.profile?.email || user?.email?.address || 'Signed-in account'
  const name = account.profile?.displayName || email.split('@')[0] || 'HashPayStream member'
  const initial = name[0]?.toUpperCase() || 'H'
  async function copy(value: string, key: string) { if (!value) return; await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(''), 1300) }

  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="flex flex-col items-center px-4 pb-6 pt-3 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-extrabold text-white shadow-[0_12px_35px_rgba(37,99,235,.24)]">{initial}</span>
      <h1 className="mt-4 text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">{name}</h1>
      <p className="mt-1 max-w-full truncate text-xs text-gray-400">{email}</p>
      <button type="button" onClick={() => void copy(account.profile?.pocketId || '', 'id')} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold tabular-nums text-gray-600 shadow-sm dark:bg-white/[0.06] dark:text-gray-300">ID: {account.profile?.pocketId || 'Loading…'}{copied === 'id' ? <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}</button>
    </div>

    <div className="overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <AccountRow icon={<WalletIcon className="h-4 w-4" />} label="Arc wallet" detail={account.profile?.walletAddress ? `${account.profile.walletAddress.slice(0, 7)}…${account.profile.walletAddress.slice(-5)}` : 'Set up from Deposit'} onClick={() => void copy(account.profile?.walletAddress || '', 'wallet')} trailing={copied === 'wallet' ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : undefined} />
      <button type="button" onClick={toggle} className="flex min-h-[62px] w-full items-center gap-3 border-t border-gray-100 px-4 text-left dark:border-white/[0.07]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300">{theme === 'dark' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}</span><span className="flex-1 text-sm font-bold text-gray-900 dark:text-white">Appearance</span><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold capitalize text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">{theme}</span></button>
    </div>

    <Link to={fundingTo} className="mt-3 flex min-h-[68px] items-center gap-3 rounded-[22px] border border-gray-100 bg-white px-4 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10"><BanknotesIcon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-950 dark:text-white">Funding partners</span><span className="mt-0.5 block text-[11px] text-gray-400">Apply or check your review</span></span><span className="text-gray-300">›</span></Link>

    <div className="mt-3 overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <a href="https://x.com/Hash_PayLink" target="_blank" rel="noreferrer" className="flex min-h-[58px] items-center px-4 text-sm font-bold text-gray-700 dark:text-gray-200">Help and support<span className="ml-auto text-gray-300">›</span></a>
      <button type="button" onClick={() => void logout()} className="flex min-h-[58px] w-full items-center gap-3 border-t border-gray-100 px-4 text-sm font-bold text-red-600 dark:border-white/[0.07] dark:text-red-400"><ArrowRightStartOnRectangleIcon className="h-4 w-4" />Sign out</button>
    </div>
    {account.error && <p className="mt-4 text-center text-xs font-semibold text-red-600">{account.error}</p>}
  </section>
}

function AccountRow({ icon, label, detail, onClick, trailing }: { icon: React.ReactNode; label: string; detail: string; onClick: () => void; trailing?: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="flex min-h-[66px] w-full items-center gap-3 px-4 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-900 dark:text-white">{label}</span><span className="mt-0.5 block truncate text-[11px] text-gray-400">{detail}</span></span>{trailing}</button>
}
