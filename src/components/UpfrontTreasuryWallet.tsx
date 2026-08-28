import { useCallback, useEffect, useState } from 'react'
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { ClipboardDocumentIcon, WalletIcon } from '@heroicons/react/24/outline'
import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem'
import { upfrontXLayerChain } from '../lib/upfrontChains'

const short = (value: string) =>
  value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-5)}` : value

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

const ESCROW_ABI = [
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

const ESCROW = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS ?? '').trim()
const NATIVE_XLAYER_USDC = getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061')

function displayUsdc(units: string) {
  if (!/^\d+$/.test(units)) return '0'
  const value = formatUnits(BigInt(units), 6)
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value
}

export default function UpfrontTreasuryWallet({ deployedUsdcUnits = '0', activePositions = 0 }: { deployedUsdcUnits?: string; activePositions?: number }) {
  const { ready: authReady, authenticated, user } = usePrivy()
  const { wallets, ready } = useWallets()
  const { createWallet } = useCreateWallet()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [walletCheckTimedOut, setWalletCheckTimedOut] = useState(false)
  const [createdTreasury, setCreatedTreasury] = useState('')
  const [availableUnits, setAvailableUnits] = useState<string | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [escrowAssetAddress, setEscrowAssetAddress] = useState('')

  const embeddedWallets = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
  const linkedEmbeddedWallets = (user?.linkedAccounts ?? []).flatMap(account =>
    account.type === 'wallet' &&
    account.chainType === 'ethereum' &&
    (account.walletClientType === 'privy' || account.walletClientType === 'privy-v2')
      ? [account]
      : [],
  )
  const signer = embeddedWallets.length === 1 ? embeddedWallets[0] : undefined
  const knownTreasuries = [...new Set([
    ...embeddedWallets.map(wallet => wallet.address),
    ...linkedEmbeddedWallets.map(wallet => wallet.address),
    ...(createdTreasury ? [createdTreasury] : []),
  ].map(address => address.toLowerCase()))]
  const treasury = knownTreasuries.length === 1 ? knownTreasuries[0] : undefined
  const walletKnownButConnectorPending = Boolean(treasury && !signer)

  useEffect(() => {
    if (ready || !authReady || !authenticated) {
      setWalletCheckTimedOut(false)
      return
    }
    const timer = window.setTimeout(() => setWalletCheckTimedOut(true), 8000)
    return () => window.clearTimeout(timer)
  }, [authReady, authenticated, ready])

  const refreshBalance = useCallback(async () => {
    if (!treasury || !isAddress(treasury) || !isAddress(ESCROW)) {
      setAvailableUnits(null)
      setError('Funding balance is unavailable.')
      return
    }
    setLoadingBalance(true)
    setError('')
    try {
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const escrowAsset = await client.readContract({ address: getAddress(ESCROW), abi: ESCROW_ABI, functionName: 'asset' })
      const balance = await client.readContract({ address: NATIVE_XLAYER_USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [getAddress(treasury)] })
      setEscrowAssetAddress(escrowAsset)
      setAvailableUnits(balance.toString())
    } catch {
      setAvailableUnits(null)
      setError('Funding balance could not be refreshed.')
    } finally {
      setLoadingBalance(false)
    }
  }, [treasury])

  useEffect(() => {
    void refreshBalance()
    const timer = window.setInterval(() => void refreshBalance(), 15_000)
    const visible = () => { if (document.visibilityState === 'visible') void refreshBalance() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refreshBalance, deployedUsdcUnits])

  async function prepare() {
    setCreating(true)
    setError('')
    try {
      const wallet = await createWallet()
      setCreatedTreasury(wallet.address)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your funding wallet could not be created.')
    } finally {
      setCreating(false)
    }
  }

  async function copyTreasury() {
    if (!treasury) return
    await navigator.clipboard.writeText(treasury)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1300)
  }

  if (!treasury) return <section className="rounded-[26px] bg-gray-950 p-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:bg-white dark:text-gray-950">
    <WalletIcon className="h-6 w-6 opacity-60" />
    <h2 className="mt-5 text-lg font-black">Create your funding wallet</h2>
    <p className="mt-2 text-xs leading-5 opacity-60">Your HashPayStream account uses one Privy wallet for X Layer funding.</p>
    {!ready && !walletCheckTimedOut && <p className="mt-4 text-xs opacity-60">Checking wallet...</p>}
    {(ready || walletCheckTimedOut) && <button type="button" disabled={creating || !authReady || !authenticated} onClick={() => void prepare()} className="mt-5 min-h-12 w-full rounded-full bg-white px-4 text-sm font-bold text-gray-950 disabled:opacity-50 dark:bg-gray-950 dark:text-white">{creating ? 'Creating wallet...' : 'Create funding wallet'}</button>}
    {error && <p className="mt-3 text-xs text-rose-300 dark:text-rose-600">{error}</p>}
  </section>

  const balance = availableUnits === null ? null : displayUsdc(availableUnits)
  const escrowNeedsUpgrade = Boolean(escrowAssetAddress && getAddress(escrowAssetAddress) !== NATIVE_XLAYER_USDC)

  return <section className="overflow-hidden rounded-[28px] bg-gray-950 p-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:bg-white dark:text-gray-950">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-45">Funding balance</p>
        <p aria-live="polite" className="mt-2 text-[clamp(2rem,10vw,2.75rem)] font-black tabular-nums tracking-[-0.04em]">
          {loadingBalance && balance === null ? <span className="inline-block h-10 w-28 animate-pulse rounded-xl bg-white/10 dark:bg-gray-950/10" /> : balance ?? 'Unavailable'}
          {balance !== null && <span className="ml-1.5 text-xs font-semibold tracking-normal opacity-45">USDC</span>}
        </p>
        <p className="mt-1 text-[10px] font-semibold opacity-40">{error ? 'Balance unavailable' : loadingBalance ? 'Refreshing balance' : 'Available on X Layer'}</p>
      </div>
      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] dark:bg-gray-950/[0.07]">X Layer</span>
    </div>


    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3 dark:bg-gray-950/[0.05]"><p className="text-[9px] font-bold uppercase tracking-[0.15em] opacity-40">Deployed</p><p className="mt-1 text-sm font-black tabular-nums">{displayUsdc(deployedUsdcUnits)} USDC</p></div>
      <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3 dark:bg-gray-950/[0.05]"><p className="text-[9px] font-bold uppercase tracking-[0.15em] opacity-40">Positions</p><p className="mt-1 text-sm font-black tabular-nums">{activePositions}</p></div>
    </div>

    <button type="button" onClick={() => void copyTreasury()} className="mt-4 flex w-full items-center gap-2 border-t border-white/10 pt-3 text-left dark:border-gray-950/10">
      <WalletIcon className="h-4 w-4 shrink-0 opacity-50" />
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] opacity-65">{short(treasury)}</span>
      <ClipboardDocumentIcon className="h-4 w-4 opacity-45" />
      <span className="sr-only">{copied ? 'Address copied' : 'Copy funding address'}</span>
    </button>
    <p className="mt-2 text-[9px] leading-4 opacity-35">Repayments settle on Arc.</p>
    {escrowNeedsUpgrade && <p role="status" className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2.5 text-[11px] leading-5 text-amber-100 dark:text-amber-800">Your native USDC is available. Funding is paused while the escrow is upgraded to native USDC.</p>}
    {walletKnownButConnectorPending && <p className="mt-3 text-[11px] text-amber-300 dark:text-amber-700">Wallet recovered. Transaction signing is still connecting.</p>}
    {knownTreasuries.length > 1 && <p className="mt-3 text-[11px] text-rose-300 dark:text-rose-700">Multiple embedded wallets are linked. Funding is locked for review.</p>}
    {error && <p role="alert" className="mt-3 text-[11px] text-rose-300 dark:text-rose-700">{error}</p>}
  </section>
}
