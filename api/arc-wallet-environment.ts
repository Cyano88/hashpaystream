/** Sandbox and live must never share credentials, RPC fallbacks or account records. */
export function arcWalletEnvironment(env: NodeJS.ProcessEnv) {
  const mode = env.HASHPAYSTREAM_ARC_ENVIRONMENT?.trim() || 'test'
  if (mode !== 'test' && mode !== 'live') throw Object.assign(new Error('Arc wallet environment is invalid.'), { status: 503 })
  const live = mode === 'live'
  return {
    mode, live, chainId: live ? 5042 : 5042002,
    blockchain: live ? 'ARC' : 'ARC-TESTNET',
    rpcUrl: live ? (env.HASHPAYSTREAM_ARC_MAINNET_RPC_URL?.trim() || 'https://rpc.mainnet.arc.io') : (env.HASHPAYSTREAM_ARC_RPC_URL?.trim() || 'https://rpc.testnet.arc.network'),
    fallbackRpcUrl: live ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.network',
    apiKey: live ? undefined : (env.CIRCLE_TEST_API_KEY ?? env.CIRCLE_API_KEY_TEST)?.trim(),
    appId: live ? env.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_MAINNET?.trim() : (env.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET ?? env.VITE_CIRCLE_USER_WALLET_APP_ID)?.trim(),
    accountStore: live ? 'hashpaystream:arc-mainnet:5042:accounts:v1' : (env.HASHPAYSTREAM_ACCOUNT_STORE_KEY?.trim() || 'hashpaystream:accounts:v1'),
  }
}
