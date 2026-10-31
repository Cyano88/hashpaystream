import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCreateWallet, useWallets } from '@privy-io/react-auth'
import { createPublicClient, defineChain, formatUnits, getAddress, http, isAddress } from 'viem'

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
  testnet: true,
})
export const ARC_USDC = getAddress('0x3600000000000000000000000000000000000000')
export const ARC_USDC_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const
export const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http() })

export function useArcWallet() {
  const { wallets, ready } = useWallets()
  const { createWallet } = useCreateWallet()
  const [createdAddress, setCreatedAddress] = useState('')
  const [balance, setBalance] = useState('0')
  const [loadingBalance, setLoadingBalance] = useState(false)
  const embedded = useMemo(() => wallets.filter(wallet => (wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2') && isAddress(wallet.address)), [wallets])
  const addresses = [...new Set([...embedded.map(wallet => getAddress(wallet.address)), ...(isAddress(createdAddress) ? [getAddress(createdAddress)] : [])])]
  const address = addresses.length === 1 ? addresses[0] : ''

  const refreshBalance = useCallback(async () => {
    if (!address) { setBalance('0'); return }
    setLoadingBalance(true)
    try {
      const value = await arcPublicClient.readContract({ address: ARC_USDC, abi: ARC_USDC_ABI, functionName: 'balanceOf', args: [getAddress(address)] })
      setBalance(formatUnits(value, 6))
    } catch { setBalance('0') } finally { setLoadingBalance(false) }
  }, [address])

  useEffect(() => { void refreshBalance() }, [refreshBalance])

  const prepareWallet = useCallback(async () => {
    if (embedded.length > 1 || addresses.length > 1) throw new Error('More than one embedded wallet is linked. Contact support before moving funds.')
    if (embedded[0]) return getAddress(embedded[0].address)
    if (isAddress(createdAddress)) return getAddress(createdAddress)
    const wallet = await createWallet()
    setCreatedAddress(getAddress(wallet.address))
    return getAddress(wallet.address)
  }, [addresses.length, createWallet, createdAddress, embedded])

  const ensureSigner = useCallback(async () => {
    if (embedded.length > 1 || addresses.length > 1) throw new Error('More than one embedded wallet is linked. Contact support before moving funds.')
    if (embedded[0]) return embedded[0]
    if (isAddress(createdAddress)) throw new Error('Your Arc wallet is still connecting. Try again in a moment.')
    await prepareWallet()
    throw new Error('Your Arc wallet is ready. Tap Confirm send again.')
  }, [addresses.length, createdAddress, embedded, prepareWallet])

  return { ready, address, balance, loadingBalance, multiple: addresses.length > 1, prepareWallet, ensureSigner, refreshBalance }
}
