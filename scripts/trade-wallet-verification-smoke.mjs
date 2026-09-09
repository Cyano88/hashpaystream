import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { verifyTradeCircleWallet } from "../api/trade-wallet-verification.ts";
const walletId = randomUUID();
const wallet = {
  id: walletId,
  userId: "synthetic-user",
  address: "0x2222222222222222222222222222222222222222",
  blockchain: "ARC-TESTNET",
  custodyType: "ENDUSER",
  accountType: "SCA",
  state: "LIVE",
};
const input = { walletId, userToken: "synthetic-session" };
const reader =
  (overrides = {}, user = { id: "synthetic-user", status: "ENABLED" }) =>
  async (_env, path, init) => {
    assert.equal(init.userToken, input.userToken);
    assert.equal(init.method, undefined, "Verification must be read-only");
    if (path === "/v1/w3s/user") return user;
    assert.equal(path, "/v1/w3s/wallets/" + walletId);
    return { wallet: { ...wallet, ...overrides } };
  };
assert.deepEqual(await verifyTradeCircleWallet(input, {}, reader()), {
  walletId,
  address: wallet.address,
  chainId: 5042002,
});
for (const overrides of [
  { id: randomUUID() },
  { userId: "another-user" },
  { userId: undefined },
  { custodyType: "DEVELOPER" },
  { state: "FROZEN" },
  { state: undefined },
  { accountType: "EOA" },
  { blockchain: "ARC" },
  { blockchain: "ETH" },
  { address: "0x" + "0".repeat(40) },
  { address: "bad" },
])
  await assert.rejects(
    () => verifyTradeCircleWallet(input, {}, reader(overrides)),
    (e) => e.status === 403,
  );
for (const user of [{}, { id: "synthetic-user", status: "DISABLED" }])
  await assert.rejects(
    () => verifyTradeCircleWallet(input, {}, reader({}, user)),
    (e) => e.status === 403,
  );
for (const bad of [
  {},
  { ...input, walletId: "../../user" },
  { ...input, userToken: "x".repeat(8001) },
])
  await assert.rejects(
    () =>
      verifyTradeCircleWallet(bad, {}, async () => {
        throw Error("Must not reach provider");
      }),
    (e) => e.status === 400,
  );
await assert.rejects(
  () =>
    verifyTradeCircleWallet(input, {}, async () => {
      throw Error("Synthetic provider outage");
    }),
  /Synthetic provider outage/,
);
console.log(
  "Trade wallet verification passed: strict owner, network, custody, state, address and input checks; read-only provider calls.",
);
