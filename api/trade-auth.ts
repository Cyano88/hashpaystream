import type { Request } from "express";
import { PrivyClient } from "@privy-io/node";
import { tradeFailure as fail } from "./trade-store.js";
export async function verifiedTradeIdentity(
  req: Request,
  env: NodeJS.ProcessEnv,
) {
  const token = String(req.headers.authorization ?? "").match(
    /^Bearer (\S+)$/i,
  )?.[1];
  if (!token) fail("Sign in to publish or manage listings.", 401);
  const appId = env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID,
    appSecret = env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) fail("Trade authentication is unavailable.", 503);
  try {
    const claims = await new PrivyClient({ appId, appSecret })
      .utils()
      .auth()
      .verifyAccessToken(token);
    if (!claims.user_id) throw new Error("No identity");
    return claims.user_id;
  } catch {
    fail("Your session expired. Sign in again.", 401);
  }
}
