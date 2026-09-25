const mode = String(import.meta.env?.VITE_HASHPAYSTREAM_ARC_ENVIRONMENT ?? 'test').trim()
if (mode !== 'live' && mode !== 'test') throw new Error('Invalid Arc wallet environment.')
export const ARC_WALLET_ENVIRONMENT = mode
export const ARC_WALLET_CHAIN_ID = mode === 'live' ? 5042 : 5042002
export const ARC_WALLET_BLOCKCHAIN = mode === 'live' ? 'ARC' : 'ARC-TESTNET'
export const ARC_WALLET_APP_ID = String(mode === 'live'
  ? import.meta.env?.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_MAINNET ?? ''
  : import.meta.env?.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET ?? import.meta.env?.VITE_CIRCLE_USER_WALLET_APP_ID ?? '').trim()
export function assertCircleWalletNetwork(wallet: { blockchain: string }) {
  if (wallet.blockchain !== ARC_WALLET_BLOCKCHAIN) throw new Error('This wallet belongs to a different Arc network. Verify your wallet again.')
}

export const ARC_WALLET_EXPLORER = mode === 'live' ? 'https://explorer.arc.io' : 'https://testnet.arcscan.app'
