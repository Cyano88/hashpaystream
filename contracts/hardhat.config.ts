import type { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import 'dotenv/config'

const rawKey = process.env.XLAYER_DEPLOYER_PRIVATE_KEY?.trim()
const accounts = rawKey ? ['0x' + rawKey.replace(/^0x/, '')] : []
const rawArcKey = process.env.ARC_DEPLOYER_PRIVATE_KEY?.trim()
const arcAccounts = rawArcKey ? ['0x' + rawArcKey.replace(/^0x/, '')] : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: './src',
    tests: './test',
    artifacts: './artifacts',
    cache: './cache',
  },
  networks: {
    xlayerTestnet: {
      url: process.env.XLAYER_TESTNET_RPC_URL ?? 'https://testrpc.xlayer.tech/terigon',
      chainId: 1952,
      accounts,
    },
    xlayerMainnet: {
      url: process.env.XLAYER_MAINNET_RPC_URL ?? 'https://rpc.xlayer.tech',
      chainId: 196,
      accounts,
    },
    arcTestnet: {
      url: process.env.ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.network',
      chainId: 5_042_002,
      accounts: arcAccounts,
    },
  },
}

export default config
