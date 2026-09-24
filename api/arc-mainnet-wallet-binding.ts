import { getAddress, isAddress } from 'viem'

export type ArcMainnetWalletBinding = {
  chainId: 5042; environment: 'live'; provider: 'circle'; blockchain: 'ARC';
  walletId: string; address: string; verifiedAt: string;
}
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }) }

// Separate credentials, no test fallback and no signing or wallet creation.
export async function verifyArcMainnetWallet(input: { userToken: string; walletId: string; address: string }, env: NodeJS.ProcessEnv = process.env): Promise<Omit<ArcMainnetWalletBinding, 'verifiedAt'>> {
  const key = env.HASHPAYSTREAM_CIRCLE_MAINNET_API_KEY?.trim() ?? ''
  if (!/^LIVE_API_KEY:[^:\s]+:[^:\s]+$/.test(key)) fail(503, 'Production Circle wallet verification is not configured.')
  if (!input.userToken || input.userToken.length > 8000 || !input.walletId || input.walletId.length > 180 || !isAddress(input.address)) fail(400, 'Provide a valid mainnet wallet session and wallet.')
  let response: Response
  try {
    response = await fetch('https://api.circle.com/v1/w3s/wallets?blockchain=ARC&pageSize=50', {
      headers: { authorization: 'Bearer ' + key, 'x-user-token': input.userToken, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    })
  } catch { fail(503, 'Mainnet wallet verification is temporarily unavailable.') }
  if (!response.ok) fail(response.status === 401 || response.status === 403 ? 403 : 503, 'Mainnet wallet ownership could not be verified.')
  const data = await response.json().catch(() => null)
  const wallets = data?.data?.wallets
  if (!Array.isArray(wallets)) fail(503, 'Mainnet wallet verification is temporarily unavailable.')
  const address = getAddress(input.address)
  const wallet = wallets.find(w => w && w.id === input.walletId && typeof w.address === 'string' && isAddress(w.address) && getAddress(w.address) === address)
  if (!wallet || wallet.blockchain !== 'ARC' || wallet.accountType !== 'SCA' || wallet.state !== 'LIVE') fail(403, 'A live Arc Mainnet Circle smart wallet owned by this wallet session is required.')
  return { chainId: 5042, environment: 'live', provider: 'circle', blockchain: 'ARC', walletId: wallet.id, address }
}
