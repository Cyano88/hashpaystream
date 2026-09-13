import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem'
import { SAVINGS_USDC_ADDRESS, savingsChain } from './savingsChain'

const ERC20_ABI = [{
  type: 'function', name: 'balanceOf', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
}] as const

export function useSavingsUsdcBalance() {
  const { ready: authReady, authenticated, user } = usePrivy()
  const { ready: walletsReady, wallets } = useWallets()
  const embedded = useMemo(
    () => wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'),
    [wallets],
  )
  const candidate = embedded.length === 1 && isAddress(embedded[0].address) ? embedded[0] : undefined
  const wallet = authReady && authenticated && candidate && user?.linkedAccounts.some(account =>
    account.type === 'wallet' && account.chainType === 'ethereum'
      && (account.walletClientType === 'privy' || account.walletClientType === 'privy-v2')
      && account.address.toLowerCase() === candidate.address.toLowerCase(),
  ) ? candidate : undefined
  const address = wallet ? getAddress(wallet.address) : undefined
  const [units, setUnits] = useState<bigint>()
  const [error, setError] = useState('')
  const sequence = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++sequence.current
    if (!address) { setUnits(undefined); setError(''); return }
    try {
      const client = createPublicClient({ chain: savingsChain, transport: http() })
      const next = await client.readContract({ address: SAVINGS_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      if (sequence.current === request) { setUnits(next); setError('') }
    } catch {
      if (sequence.current === request) setError('Arc Testnet balance is temporarily unavailable.')
    }
  }, [address])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { ++sequence.current; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  return {
    ready: authReady && authenticated && (walletsReady || Boolean(wallet)),
    wallet,
    address,
    units,
    balance: units === undefined ? '' : formatUnits(units, 6),
    balanceReady: units !== undefined,
    error,
    refresh,
  }
}
