import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem'
import { upfrontXLayerChain } from './upfrontChains'

export const XLAYER_USDC_ADDRESS = getAddress(upfrontXLayerChain.id === 196
  ? '0xB6CEceAB302E2E4948951eE7843FC24E92933061'
  : '0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE')

const ERC20_ABI = [{
  type: 'function', name: 'balanceOf', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
}] as const

type CachedBalance = { address: string; units: bigint }

const balanceMemory = new Map<string, CachedBalance>()
const BALANCE_CACHE_PREFIX = 'hashpaystream:xlayer-usdc:'

function cacheKey(scope: string) {
  return BALANCE_CACHE_PREFIX + encodeURIComponent(scope)
}

function readCachedBalance(scope?: string, address?: string) {
  if (!scope) return undefined
  let cached = balanceMemory.get(scope)
  if (!cached) {
    try {
      const value = window.localStorage.getItem(cacheKey(scope))
      const parsed = value ? JSON.parse(value) as { address?: unknown; units?: unknown } : undefined
      if (typeof parsed?.address === 'string' && typeof parsed.units === 'string' && /^\d+$/.test(parsed.units)) {
        cached = { address: parsed.address.toLowerCase(), units: BigInt(parsed.units) }
        balanceMemory.set(scope, cached)
      }
    } catch { /* optional */ }
  }
  if (address && cached?.address !== address.toLowerCase()) {
    balanceMemory.delete(scope)
    try { window.localStorage.removeItem(cacheKey(scope)) } catch { /* optional */ }
    return undefined
  }
  return cached?.units
}

function writeCachedBalance(scope: string, address: string, units: bigint) {
  const cached = { address: address.toLowerCase(), units }
  balanceMemory.set(scope, cached)
  try { window.localStorage.setItem(cacheKey(scope), JSON.stringify({ address: cached.address, units: units.toString() })) } catch { /* optional */ }
}
export function useXLayerUsdcBalance() {
  const { ready: authReady, authenticated, user } = usePrivy()
  const { ready: walletsReady, wallets } = useWallets()
  const scope = authenticated ? user?.id : undefined
  const embedded = useMemo(
    () => wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'),
    [wallets],
  )
  const wallet = embedded.length === 1 && isAddress(embedded[0].address) ? embedded[0] : undefined
  const address = wallet ? getAddress(wallet.address) : undefined
  const [balanceState, setBalanceState] = useState<{ scope?: string; units?: bigint }>(() => ({ scope, units: readCachedBalance(scope, address) }))
  const units = balanceState.scope === scope ? balanceState.units : readCachedBalance(scope, address)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const activeScope = useRef(scope)
  activeScope.current = scope

  const refresh = useCallback(async () => {
    if (!scope) { if (mounted.current) { setBalanceState({ scope: undefined, units: undefined }); setError('') }; return }
    if (!address) { if (mounted.current && activeScope.current === scope) { setBalanceState({ scope, units: readCachedBalance(scope) }); setError('') }; return }
    try {
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const next = await client.readContract({ address: XLAYER_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      if (mounted.current && activeScope.current === scope) {
        writeCachedBalance(scope, address, next)
        setBalanceState({ scope, units: next })
        setError('')
      }
    } catch {
      if (mounted.current && activeScope.current === scope) setError('X Layer balance is temporarily unavailable.')
    }
  }, [address, scope])

  useEffect(() => {
    mounted.current = true
    const cached = readCachedBalance(scope, address)
    setBalanceState({ scope, units: cached })
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [address, refresh, scope])

  return {
    ready: authReady && walletsReady,
    wallet,
    address,
    units,
    balance: units === undefined ? '' : formatUnits(units, 6),
    balanceReady: units !== undefined,
    error,
    refresh,
  }
}
