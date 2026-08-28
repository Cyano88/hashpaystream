import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem'
import { upfrontXLayerChain } from './upfrontChains'

export const XLAYER_USDC_ADDRESS = getAddress(upfrontXLayerChain.id === 196
  ? '0xB6CEceAB302E2E4948951eE7843FC24E92933061'
  : '0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE')

const ERC20_ABI = [{
  type: 'function', name: 'balanceOf', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
}] as const

export function useXLayerUsdcBalance() {
  const { ready, wallets } = useWallets()
  const embedded = useMemo(
    () => wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'),
    [wallets],
  )
  const wallet = embedded.length === 1 && isAddress(embedded[0].address) ? embedded[0] : undefined
  const address = wallet ? getAddress(wallet.address) : undefined
  const [units, setUnits] = useState<bigint>()
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    if (!address) { if (mounted.current) setUnits(undefined); return }
    try {
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const next = await client.readContract({ address: XLAYER_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      if (mounted.current) { setUnits(next); setError('') }
    } catch {
      if (mounted.current) setError('X Layer balance is temporarily unavailable.')
    }
  }, [address])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  return {
    ready,
    wallet,
    address,
    units,
    balance: units === undefined ? '' : formatUnits(units, 6),
    balanceReady: units !== undefined,
    error,
    refresh,
  }
}
