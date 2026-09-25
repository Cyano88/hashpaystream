import { fetchWithTimeout } from './fetchWithTimeout'
export type StockPortfolio = { chainId: 196; wallet: string; holdings: { address: string; symbol: string; name: string; balance: string; estimatedValueUsd: number | null }[]; complete: boolean; stale: boolean; estimatedValueUsd: number | null; observedAt: number }
export async function readStockBalances(wallet: string, token: string, signal: AbortSignal): Promise<StockPortfolio> {
  const response = await fetchWithTimeout('/api/hashpaystream/v1/stocks/balances', { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ wallet }) }, 45000)
  const data = await response.json()
  if (!response.ok || data.ok !== true || data.chainId !== 196 || data.wallet?.toLowerCase() !== wallet.toLowerCase() || !Array.isArray(data.holdings)) throw Error('Stock balances are unavailable.')
  return data
}
