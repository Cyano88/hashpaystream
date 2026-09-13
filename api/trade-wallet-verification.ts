import { getAddress, isAddress } from "viem";
import { circleJson } from "./circle-wallet.js";
import { tradeFailure as fail } from "./trade-store.js";
export type TradeSettlementWallet = {
  walletId: string;
  address: string;
  chainId: 5042002;
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Explicitly links possession of this Circle session to the authenticated Trade actor.
// This does not assert that Circle and Privy have matching email identities.
export async function verifyTradeCircleWallet(
  input: { walletId?: unknown; userToken?: unknown },
  env: NodeJS.ProcessEnv,
  read: typeof circleJson = circleJson,
): Promise<TradeSettlementWallet> {
  const { walletId, userToken } = input;
  if (
    typeof walletId !== "string" ||
    !UUID.test(walletId) ||
    typeof userToken !== "string" ||
    !userToken ||
    userToken.length > 8000
  )
    fail("Open your Circle wallet and select a settlement wallet.", 400);
  const user = await read<{ id?: string; status?: string }>(
    env,
    "/v1/w3s/user",
    { userToken },
  );
  if (typeof user.id !== "string" || !user.id || user.status !== "ENABLED")
    fail("Circle wallet session is unavailable.", 403);
  const data = await read<{ wallet?: Record<string, unknown> }>(
    env,
    `/v1/w3s/wallets/${encodeURIComponent(walletId)}`,
    { userToken },
  );
  const wallet = data.wallet;
  if (
    !wallet ||
    wallet.id !== walletId ||
    wallet.userId !== user.id ||
    wallet.custodyType !== "ENDUSER" ||
    wallet.accountType !== "SCA" ||
    wallet.state !== "LIVE" ||
    wallet.blockchain !== "ARC-TESTNET" ||
    typeof wallet.address !== "string" ||
    !isAddress(wallet.address) ||
    /^0x0{40}$/i.test(wallet.address)
  )
    fail(
      "Select an active Arc testnet smart wallet owned by this Circle session.",
      403,
    );
  return { walletId, address: getAddress(wallet.address), chainId: 5042002 };
}
