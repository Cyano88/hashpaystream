import { useEffect, useState } from 'react'
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { CheckCircleIcon, WalletIcon } from '@heroicons/react/24/outline'
import { getAddress, isAddress } from 'viem'
import { upfrontXLayerChain } from '../lib/upfrontChains'

type Props = {
  value: string
  onChange: (address: string) => void
}

const short = (value: string) => value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-5)}` : value

export function ProviderPayoutWallet({ value, onChange }: Props) {
  const { ready: authReady, authenticated, user } = usePrivy()
  const { wallets, ready } = useWallets()
  const { createWallet } = useCreateWallet()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [createdAddress, setCreatedAddress] = useState('')

  const connected = wallets.flatMap(wallet =>
    (wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2') && isAddress(wallet.address)
      ? [getAddress(wallet.address)]
      : [],
  )
  const linked = (user?.linkedAccounts ?? []).flatMap(account =>
    account.type === 'wallet'
      && account.chainType === 'ethereum'
      && (account.walletClientType === 'privy' || account.walletClientType === 'privy-v2')
      && isAddress(account.address)
      ? [getAddress(account.address)]
      : [],
  )
  const addresses = [...new Set([...connected, ...linked, ...(isAddress(createdAddress) ? [getAddress(createdAddress)] : [])])]
  const payoutAddress = addresses.length === 1 ? addresses[0] : ''

  useEffect(() => {
    if (value !== payoutAddress) onChange(payoutAddress)
  }, [onChange, payoutAddress, value])

  async function prepare() {
    setCreating(true)
    setError('')
    try {
      const wallet = await createWallet()
      setCreatedAddress(getAddress(wallet.address))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your X Layer payout wallet could not be created.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10 sm:col-span-2">
      <div className="flex items-start gap-3">
        <WalletIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-blue-950 dark:text-blue-100">Your X Layer payout wallet</p>
              <p className="mt-1 text-[11px] leading-5 text-blue-800/80 dark:text-blue-200/80">HashPayStream creates and verifies this wallet for your signed-in account. Approved advances are sent here.</p>
            </div>
            {payoutAddress && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircleIcon className="h-3.5 w-3.5" />Verified</span>}
          </div>
          {!ready && !payoutAddress && <p className="mt-3 text-xs text-blue-800 dark:text-blue-200">Checking your wallet...</p>}
          {ready && addresses.length === 0 && <button type="button" disabled={creating || !authReady || !authenticated} onClick={() => void prepare()} className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{creating ? 'Creating wallet...' : 'Create my payout wallet'}</button>}
          {addresses.length > 1 && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700 dark:text-rose-300">More than one embedded wallet is linked to this account. Contact support before requesting an advance.</p>}
          {payoutAddress && <div className="mt-3 rounded-xl border border-blue-200/70 bg-white/70 px-3 py-2 dark:border-blue-300/10 dark:bg-black/10"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">Verified address</p><p className="mt-1 font-mono text-xs text-blue-950 dark:text-blue-100" title={payoutAddress}>{short(payoutAddress)}</p></div>}
          <p className="mt-3 text-[11px] leading-5 text-blue-800/80 dark:text-blue-200/80">You do not need to enter an address or hold OKB to receive the advance.</p>
          {error && <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  )
}
