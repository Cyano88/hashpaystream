import { ARC_WALLET_ENVIRONMENT } from './arcWalletConfig'
import { defineChain, getAddress } from 'viem'
import { arcTestnet } from './upfrontChains'

export const savingsChain = ARC_WALLET_ENVIRONMENT === 'live' ? defineChain({
  id: 5042, name: 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
}) : arcTestnet
export const SAVINGS_USDC_ADDRESS = getAddress('0x3600000000000000000000000000000000000000')
