import { useEffect, useState } from 'react'
import { ArrowRightStartOnRectangleIcon, CheckIcon, ChevronRightIcon, ClipboardDocumentIcon, MoonIcon, PencilIcon, SunIcon, UserIcon, WalletIcon } from '@heroicons/react/24/outline'
import { usePrivy } from '@privy-io/react-auth'
import { useTheme } from '../lib/ThemeContext'
import { useCircleWallet } from '../lib/circleWallet'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useStreamAccount } from '../lib/streamAccount'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'
import { StreamPayLoadingState } from './ui/StreamPayLoadingState'

export default function StreamPayAccount() {
  const { authenticated, user, logout } = usePrivy()
  const { theme, toggle } = useTheme()
  const account = useStreamAccount()
  const wallet = useCircleWallet()
  const [copied, setCopied] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftId, setDraftId] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  useEffect(() => { if (account.profile?.pocketId) setDraftId(account.profile.pocketId) }, [account.profile?.pocketId])
  if (!authenticated) return <AgreementSignInLanding splashState={splashState} />
  if (account.loading) return <StreamPayLoadingState active="account" />
  const email = account.profile?.email || user?.email?.address || 'Signed-in account'
  const name = account.profile?.displayName || email.split('@')[0] || 'HashPayStream member'
  async function copy(value: string, key: string) { if (!value) return; await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(''), 1300) }
  async function saveId() {
    setSaving(true); setEditError('')
    try { await account.updatePocketId(draftId); setEditing(false) }
    catch (reason) { setEditError(reason instanceof Error ? reason.message : 'Pocket ID could not be saved.') }
    finally { setSaving(false) }
  }
  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="flex flex-col items-center px-4 pb-6 pt-3 text-center">
      <UserIcon className="h-20 w-20 stroke-[1.25] text-gray-400 dark:text-gray-500" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">{name}</h1>
      <p className="mt-1 max-w-full truncate text-xs text-gray-400">{email}</p>
    </div>

    <div className="overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      {editing ? <div className="p-4"><label className="text-[10px] font-black uppercase tracking-[.18em] text-gray-400">Pocket ID</label><input value={draftId} inputMode="numeric" onChange={event => setDraftId(event.target.value.replace(/\D/g, '').slice(0, 12))} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-4 text-base font-bold tabular-nums outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/[0.04]" /><p className="mt-2 text-[10px] text-gray-400">6 to 12 digits. Previous IDs stay reserved to your account.</p>{editError && <p className="mt-2 text-xs font-semibold text-red-600">{editError}</p>}<div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setEditing(false); setDraftId(account.profile?.pocketId || ''); setEditError('') }} className="min-h-11 rounded-full text-xs font-bold text-gray-500">Cancel</button><button type="button" disabled={saving || !/^\d{6,12}$/.test(draftId)} onClick={() => void saveId()} className="min-h-11 rounded-full bg-gray-950 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{saving ? 'Saving…' : 'Save ID'}</button></div></div> : <button type="button" onClick={() => setEditing(true)} className="flex min-h-[68px] w-full items-center gap-3 px-4 text-left"><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[.18em] text-gray-400">Pocket ID</span><span className="mt-1 block text-base font-black tabular-nums">{account.profile?.pocketId}</span></span><PencilIcon className="h-4 w-4 text-gray-400" /><span className="sr-only">Edit Pocket ID</span></button>}
      <button type="button" onClick={() => void copy(wallet.address, 'wallet')} className="flex min-h-[66px] w-full items-center gap-3 border-t border-gray-100 px-4 text-left dark:border-white/[0.07]"><WalletIcon className="h-5 w-5 text-gray-500" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-900 dark:text-white">Circle wallet</span><span className="mt-0.5 block truncate font-mono text-[10px] text-gray-400">{wallet.address}</span></span>{copied === 'wallet' ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : <ClipboardDocumentIcon className="h-4 w-4 text-gray-400" />}</button>
      <button type="button" onClick={toggle} className="flex min-h-[62px] w-full items-center gap-3 border-t border-gray-100 px-4 text-left dark:border-white/[0.07]"><span className="text-gray-500">{theme === 'dark' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}</span><span className="flex-1 text-sm font-bold text-gray-900 dark:text-white">Appearance</span><span className="text-[10px] font-bold capitalize text-gray-400">{theme}</span></button>
    </div>

    <div className="mt-3 overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><a href="https://x.com/Hash_PayLink" target="_blank" rel="noreferrer" className="flex min-h-[58px] items-center px-4 text-sm font-bold text-gray-700 dark:text-gray-200">Help and support<ChevronRightIcon className="ml-auto h-4 w-4 text-gray-300" /></a><button type="button" onClick={() => void logout()} className="flex min-h-[58px] w-full items-center gap-3 border-t border-gray-100 px-4 text-sm font-bold text-red-600 dark:border-white/[0.07] dark:text-red-400"><ArrowRightStartOnRectangleIcon className="h-4 w-4" />Sign out</button></div>
    {account.error && <p className="mt-4 text-center text-xs font-semibold text-red-600">{account.error}</p>}
  </section>
}
