import { useEffect, useState } from 'react'
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { CheckCircleIcon, WalletIcon } from '@heroicons/react/24/outline'
import { getAddress, isAddress } from 'viem'

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
  const [walletCheckTimedOut, setWalletCheckTimedOut] = useState(false)

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

  useEffect(() => {
    if (ready || !authReady || !authenticated || payoutAddress) {
      setWalletCheckTimedOut(false)
      return
    }
    const timer = window.setTimeout(() => setWalletCheckTimedOut(true), 8_000)
    return () => window.clearTimeout(timer)
  }, [authReady, authenticated, payoutAddress, ready])

  async function prepare() {
    if (!authReady) {
      setError('Your HashPayStream sign-in is still restoring. Try again in a moment.')
      return
    }
    if (!authenticated) {
      setError('Sign in to HashPayStream again before creating your payout wallet.')
      return
    }
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
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3.5 dark:border-white/10 dark:bg-white/[0.04] sm:col-span-2">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm dark:bg-white/[0.07] dark:text-gray-300"><WalletIcon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-950 dark:text-white">X Layer payout wallet</p>
              <p className="mt-0.5 text-[10px] text-gray-400">{payoutAddress ? 'Verified for this account' : 'Required to receive early pay'}</p>
            </div>
            {payoutAddress && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircleIcon className="h-3.5 w-3.5" />Verified</span>}
          </div>
          {!ready && !payoutAddress && !walletCheckTimedOut && <p className="mt-2 text-xs text-gray-500">Checking wallet...</p>}
          {walletCheckTimedOut && !payoutAddress && <p className="mt-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">Wallet check took too long. Creating the wallet is safe and cannot move funds.</p>}
          {!payoutAddress && (ready || walletCheckTimedOut) && <button type="button" aria-label="Create X Layer payout wallet" disabled={creating} onClick={() => void prepare()} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-wait disabled:opacity-60">{creating ? 'Creating payout wallet...' : 'Create payout wallet'}</button>}
          {addresses.length > 1 && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700 dark:text-rose-300">More than one embedded wallet is linked to this account. Contact support before requesting an advance.</p>}
          {payoutAddress && <p className="mt-2 font-mono text-xs text-gray-600 dark:text-gray-300" title={payoutAddress}>{short(payoutAddress)}</p>}
          {error && <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  )
}
