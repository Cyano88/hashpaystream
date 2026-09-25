import type { Request, Response } from 'express'
import { verifiedTradeIdentity } from './trade-auth.js'
import { verifyTradePrivyWallet } from './trade-privy-wallet.js'
export default async function stockBalances(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const user = await verifiedTradeIdentity(req, process.env)
    const wallet = await verifyTradePrivyWallet(user!, req.body?.wallet, process.env)
    const key = process.env.HASHPAYSTREAM_STOCK_BALANCE_API_KEY || ''
    if (!/^hpl_app_[a-f0-9]{64}$/.test(key)) return res.status(503).json({ ok: false, error: 'Stock balances are not available yet.' })
    const operation = req.originalUrl?.split('?')[0] === '/api/hashpaystream/v1/stocks/receive' ? 'receive' : 'balances'
    const response = await fetch('https://app.hashpaylink.com/api/v2/wallets/stocks/' + operation, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(40000), headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify({ wallet: wallet.address }) })
    const data = await response.json()
    if (!response.ok || data.ok !== true || data.chainId !== 196 || data.wallet?.toLowerCase() !== wallet.address.toLowerCase()) throw Error('Invalid portfolio response')
    return res.json(data)
  } catch (reason) { const status = Number((reason as { status?: number }).status) || 503; return res.status(status).json({ ok: false, error: status === 401 || status === 403 ? 'Sign in with the account that owns this wallet.' : 'Stock balances are unavailable. Try again.' }) }
}
