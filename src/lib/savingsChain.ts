import { getAddress } from 'viem'
import { arcTestnet } from './upfrontChains'

export const savingsChain = arcTestnet
export const SAVINGS_USDC_ADDRESS = getAddress('0x3600000000000000000000000000000000000000')
