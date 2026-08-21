import { defineChain } from 'viem'

export const xLayerMainnet = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.xlayer.tech'] } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.okx.com/web3/explorer/xlayer' } },
})

export const xLayerTestnet = defineChain({
  id: 1952,
  name: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://testrpc.xlayer.tech/terigon'] } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.okx.com/web3/explorer/xlayer-test' } },
  testnet: true,
})

export const upfrontXLayerChain = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? '1952') === '196'
  ? xLayerMainnet
  : xLayerTestnet

export const upfrontTreasuryEnabled = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED ?? 'false').toLowerCase() === 'true'
