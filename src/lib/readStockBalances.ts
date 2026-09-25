import { fetchWithTimeout } from './fetchWithTimeout'
export type WalletReceiveDetails = { address: string; chainId: number; networkName: string; qrValue: string; depositNotice: string; gasNotice: string; pocketIdRouting: string }
export type StockPortfolio = { gas?: { symbol: 'OKB'; balance: string; units: string; decimals: 18; observedAt: number; stale: boolean }; receive?: WalletReceiveDetails; chainId: 196; wallet: string; holdings: { address: string; symbol: string; name: string; balance: string; estimatedValueUsd: number | null; priceObservedAt: number | null }[]; complete: boolean; stale: boolean; estimatedValueUsd: number | null; observedAt: number }
export async function readStockBalances(wallet: string, token: string, signal: AbortSignal): Promise<StockPortfolio> {
  const response = await fetchWithTimeout('/api/hashpaystream/v1/stocks/balances', { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ wallet }) }, 45000)
  const data = await response.json()
  if (!response.ok || data.ok !== true || data.chainId !== 196 || data.wallet?.toLowerCase() !== wallet.toLowerCase() || !Array.isArray(data.holdings)) throw Error('Stock balances are unavailable.')
  if (data.receive && (data.receive.chainId !== 196 || data.receive.address?.toLowerCase() !== wallet.toLowerCase() || data.receive.qrValue !== data.receive.address)) throw Error('Receiving wallet did not match this account.')
  return data
}

export function stockPortfolioExpiresAt(portfolio: StockPortfolio): number {
  const times = [portfolio.observedAt, ...portfolio.holdings.map(holding => holding.priceObservedAt)]
  if (times.some(time => typeof time !== 'number' || !Number.isFinite(time) || time <= 0)) return 0
  return Math.min(...times as number[]) + 60000
}
export function stockPortfolioValueIsFresh(portfolio: StockPortfolio, now: number): boolean {
  return portfolio.complete && !portfolio.stale && portfolio.estimatedValueUsd !== null
    && Number.isFinite(portfolio.estimatedValueUsd) && portfolio.estimatedValueUsd >= 0
    && portfolio.observedAt <= now + 5000
    && portfolio.holdings.every(holding => holding.priceObservedAt !== null && holding.priceObservedAt <= now + 5000)
    && stockPortfolioExpiresAt(portfolio) > now
}
