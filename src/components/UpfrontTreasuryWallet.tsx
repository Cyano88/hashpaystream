import { useState } from 'react'
import { useCreateWallet, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { CheckCircleIcon, WalletIcon } from '@heroicons/react/24/outline'
import { upfrontXLayerChain } from '../lib/upfrontChains'

const short = (value: string) => value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-5)}` : value

export default function UpfrontTreasuryWallet() {
  const { wallets, ready } = useWallets()
  const { createWallet } = useCreateWallet()
  const { client } = useSmartWallets()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const signer = wallets.find(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
  const treasury = client?.account?.address

  async function prepare() {
    setCreating(true); setError('')
    try { await createWallet() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The treasury signer could not be created.') }
    finally { setCreating(false) }
  }

  return <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10">
    <div className="flex items-start gap-3"><WalletIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" /><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-blue-950 dark:text-blue-100">X Layer treasury wallet</p><p className="mt-1 text-[11px] leading-5 text-blue-800/80 dark:text-blue-200/80">Bound to this approved Privy identity on {upfrontXLayerChain.name}. No funds move during setup.</p></div>{treasury && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircleIcon className="h-3.5 w-3.5" />Ready</span>}</div>
      {!ready && <p className="mt-3 text-xs text-blue-800">Checking wallet state...</p>}
      {ready && !signer && <button type="button" disabled={creating} onClick={() => void prepare()} className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{creating ? 'Creating signer...' : 'Create treasury signer'}</button>}
      {signer && <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2"><Row label="Privy signer" address={signer.address} /><Row label="Treasury smart wallet" address={treasury} /></div>}
      {signer && !treasury && <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-200">Signer ready. Smart-wallet provisioning is waiting for verified X Layer bundler and paymaster settings in Privy.</p>}
      {treasury && <p className="mt-3 text-[11px] leading-5 text-blue-800/80 dark:text-blue-200/80">This address still needs an explicit owner allowlist transaction. The contract remains paused.</p>}
      {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
    </div></div>
  </div>
}

function Row({ label, address }: { label: string; address?: string }) {
  return <div className="rounded-xl border border-blue-200/70 bg-white/70 px-3 py-2 dark:border-blue-300/10 dark:bg-black/10"><p className="font-medium text-blue-700">{label}</p><p className="mt-1 truncate font-mono text-blue-950 dark:text-blue-100">{address ? short(address) : 'Awaiting dashboard setup'}</p></div>
}
