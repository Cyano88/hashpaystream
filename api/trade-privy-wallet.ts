import { PrivyClient } from '@privy-io/node';
import { getAddress, isAddress } from 'viem';
import { tradeFailure as fail } from './trade-store.js';
import type { TradeSettlementWallet } from './trade-wallet-verification.js';
export async function verifyTradePrivyWallet(userId: string, address: unknown, env: NodeJS.ProcessEnv,
  load = async (id: string) => {
    const appId = env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID;
    if (!appId || !env.PRIVY_APP_SECRET) fail('Wallet verification is unavailable.', 503);
    return new PrivyClient({ appId: appId!, appSecret: env.PRIVY_APP_SECRET! }).users()._get(id);
  }): Promise<TradeSettlementWallet> {
  if (typeof address !== 'string' || !isAddress(address)) fail('Your trading wallet is unavailable.', 400);
  const user = await load(userId);
  if (user.id !== userId) fail('Wallet account mismatch.', 403);
  const wallets = user.linked_accounts.filter(a => a.type === 'wallet' && a.chain_type === 'ethereum'
    && a.wallet_client_type === 'privy' && a.connector_type === 'embedded');
  if (wallets.length !== 1 || wallets[0].type !== 'wallet' || !isAddress(wallets[0].address)
    || getAddress(wallets[0].address) !== getAddress(address as string)) fail('Use your verified embedded wallet.', 403);
  const normalized = getAddress(address as string);
  return { walletId: `privy:${normalized.toLowerCase()}`, address: normalized, chainId: 196 };
}
