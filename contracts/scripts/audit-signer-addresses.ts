import 'dotenv/config'
import { Wallet } from 'ethers'

const names = [
  'XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY',
  'XLAYER_DEPLOYER_PRIVATE_KEY',
  'ARC_DEPLOYER_PRIVATE_KEY',
  'POLYDESK_UPFRONT_EIP712_PRIVATE_KEY',
  'HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY',
  'HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY',
] as const

for (const name of names) {
  const key = process.env[name]?.trim()
  console.log(`${name}=${key ? new Wallet(key).address : 'MISSING'}`)
}
