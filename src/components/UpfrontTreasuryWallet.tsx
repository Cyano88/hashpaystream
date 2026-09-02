import { useCallback, useEffect, useState } from 'react'
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { ClipboardDocumentIcon, WalletIcon } from '@heroicons/react/24/outline'
import { createPublicClient, getAddress, http, isAddress } from 'viem'
import { formatUsdcBalance } from '../lib/useAgreements'
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
  return formatUsdcBalance(units).replace(/ USDC$/, '')
}

export default function UpfrontTreasuryWallet({ deployedUsdcUnits = '0', activePositions = 0 }: { deployedUsdcUnits?: string; activePositions?: number }) {
  const { ready: authReady, authenticated, user } = usePrivy()
  const { wallets, ready } = useWallets()
  const { createWallet } = useCreateWallet()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [fundingDetailsOpen, setFundingDetailsOpen] = useState(false)
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

  const refreshBalance = useCallback(async (foreground = false) => {
    if (!treasury || !isAddress(treasury) || !isAddress(ESCROW)) {
      if (foreground) setAvailableUnits(null)
      setError('Funding balance is unavailable.')
      return
    }
    if (foreground) setLoadingBalance(true)
    if (foreground) setError('')
    try {
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const escrowAsset = await client.readContract({ address: getAddress(ESCROW), abi: ESCROW_ABI, functionName: 'asset' })
      const balance = await client.readContract({ address: NATIVE_XLAYER_USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [getAddress(treasury)] })
      setEscrowAssetAddress(escrowAsset)
      setAvailableUnits(balance.toString())
      setError('')
    } catch {
      if (foreground) setAvailableUnits(null)
      setError('Funding balance could not be refreshed.')
    } finally {
      if (foreground) setLoadingBalance(false)
    }
  }, [treasury])

  useEffect(() => {
    void refreshBalance(true)
    const timer = window.setInterval(() => void refreshBalance(false), 15_000)
    const visible = () => { if (document.visibilityState === 'visible') void refreshBalance(false) }
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

  if (!treasury) return <section className="rounded-[26px] border border-zinc-800 bg-zinc-950 p-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:border-[#262626] dark:bg-[#121212]">
    <WalletIcon className="h-6 w-6 opacity-60" />
    <h2 className="mt-5 text-lg font-black">Create your funding wallet</h2>
    <p className="mt-2 text-xs leading-5 opacity-60">Your HashPayStream account uses one Privy wallet for X Layer funding.</p>
    {!ready && !walletCheckTimedOut && <p className="mt-4 text-xs opacity-60">Checking wallet...</p>}
    {(ready || walletCheckTimedOut) && <button type="button" disabled={creating || !authReady || !authenticated} onClick={() => void prepare()} className="mt-5 min-h-12 w-full rounded-full bg-white px-4 text-sm font-bold text-zinc-950 disabled:opacity-50">{creating ? 'Creating wallet...' : 'Create funding wallet'}</button>}
    {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
  </section>

  const balance = availableUnits === null ? null : displayUsdc(availableUnits)
  const escrowNeedsUpgrade = Boolean(escrowAssetAddress && getAddress(escrowAssetAddress) !== NATIVE_XLAYER_USDC)

  return <>
    <section className="overflow-hidden rounded-[24px] border border-zinc-800 bg-zinc-950 px-4 py-4 text-white shadow-[0_14px_38px_rgba(15,23,42,0.12)] dark:border-[#262626] dark:bg-[#121212]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-45">Available to fund</p>
          <p aria-live="polite" className="mt-1 text-[clamp(1.75rem,9vw,2.25rem)] font-black tabular-nums tracking-[-0.04em]">
            {loadingBalance && balance === null ? <span className="inline-block h-9 w-24 animate-pulse rounded-lg bg-white/10" /> : balance ?? 'Unavailable'}
            {balance !== null && <span className="ml-1.5 text-[10px] font-semibold tracking-normal opacity-45">USDC</span>}
          </p>
          <p className="mt-0.5 text-[9px] font-semibold opacity-35">X Layer</p>
        </div>
        <button type="button" onClick={() => setFundingDetailsOpen(true)} className="rounded-full bg-white px-3 py-2 text-[10px] font-black text-zinc-950 transition active:scale-95">Add funds</button>
      </div>

      <div className="mt-3 grid grid-cols-2 border-t border-white/10 pt-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-40">Deployed</p>
          <p className="mt-0.5 text-xs font-black tabular-nums">{displayUsdc(deployedUsdcUnits)} USDC</p>
        </div>
        <div className="border-l border-white/10 pl-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-40">Active</p>
          <p className="mt-0.5 text-xs font-black tabular-nums">{activePositions}</p>
        </div>
      </div>

      {escrowNeedsUpgrade && <p role="status" className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2.5 text-[11px] leading-5 text-amber-100">Funding is paused while the escrow is upgraded to native USDC.</p>}
      {walletKnownButConnectorPending && <p className="mt-3 text-[11px] text-amber-300">Wallet recovered. Transaction signing is still connecting.</p>}
      {knownTreasuries.length > 1 && <p className="mt-3 text-[11px] text-rose-300">Multiple embedded wallets are linked. Funding is locked for review.</p>}
      {error && balance === null && <p role="alert" className="mt-3 text-[11px] text-rose-300">{error}</p>}
    </section>

    {fundingDetailsOpen && <div className="fixed inset-0 z-[170] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="funding-wallet-title">
      <button type="button" aria-label="Close funding wallet" onClick={() => setFundingDetailsOpen(false)} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <section className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] border border-b-0 border-zinc-200 bg-[#f6f6f3] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-zinc-950 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
        <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300 dark:bg-white/20" />
        <div className="mt-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200/70 dark:bg-white/10"><WalletIcon className="h-5 w-5" /></span>
          <div><h2 id="funding-wallet-title" className="text-base font-black">Add funds</h2><p className="mt-0.5 text-[10px] text-zinc-500 dark:text-white/45">USDC on X Layer</p></div>
        </div>
        <button type="button" onClick={() => void copyTreasury()} className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.07]">
          <span className="min-w-0 flex-1 break-all font-mono text-[11px] leading-5 text-zinc-600 dark:text-white/70">{treasury}</span>
          <ClipboardDocumentIcon className="h-5 w-5 shrink-0 text-zinc-400 dark:text-white/45" />
        </button>
        <p aria-live="polite" className="mt-2 min-h-4 text-center text-[10px] font-semibold text-emerald-400">{copied ? 'Address copied' : 'Tap the address to copy'}</p>
        <p className="mt-3 text-center text-[10px] leading-4 text-zinc-500 dark:text-white/40">Only send native USDC on X Layer to this address.</p>
        <button type="button" onClick={() => setFundingDetailsOpen(false)} className="stream-primary mt-5 w-full">Done</button>
      </section>
    </div>}
  </>
}
