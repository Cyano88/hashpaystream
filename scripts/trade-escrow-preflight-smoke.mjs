import fs from "node:fs";
import assert from "node:assert/strict";
import {
  assertTradeRuntime,
  verifyTradeEscrowPreflight,
} from "../api/trade-escrow-preflight.ts";
const f = JSON.parse(
  fs.readFileSync("output/playwright/trade-preflight-evm-fixture.json", "utf8"),
);
const numbers = [
  "amount",
  "fundBy",
  "dispatchWindow",
  "deliveryWindow",
  "inspectionWindow",
];
const terms = { ...f.terms };
for (const k of numbers) terms[k] = BigInt(terms[k]);
const binding = {
  chainId: f.chainId,
  factory: f.factory,
  contractTerms: terms,
  termsHash: terms.termsHash,
};
let changed = {},
  chain = f.chainId,
  code = f.escrowCode,
  registry = f.escrow,
  lifecycle = f.state,
  reorg = false,
  blockReads = 0,
  expired = false,
  headExpired = false,
  headStateOverride = undefined;
const reader = {
  getChainId: async () => chain,
  getBlockNumber: async () => BigInt(f.head),
  getBlock: async ({ blockNumber }) => {
    assert.ok(
      blockNumber === BigInt(f.head - 1) || blockNumber === BigInt(f.head),
    );
    blockReads++;
    return {
      hash: reorg && blockReads > 1 ? "0x" + "f".repeat(64) : f.block.hash,
      timestamp:
        expired || (headExpired && blockNumber === BigInt(f.head))
          ? terms.fundBy
          : BigInt(
              blockNumber === BigInt(f.head)
                ? (f.headTimestamp ?? f.block.timestamp + 1)
                : f.block.timestamp,
            ),
    };
  },
  getCode: async ({ address, blockNumber }) => {
    assert.equal(blockNumber, BigInt(f.head - 1));
    return address.toLowerCase() === f.factory.toLowerCase()
      ? f.factoryCode
      : code;
  },
  readContract: async ({ address, functionName, args, blockNumber }) => {
    if (blockNumber === BigInt(f.head)) {
      assert.equal(functionName, "state");
      return headStateOverride ?? lifecycle;
    }
    assert.equal(blockNumber, BigInt(f.head - 1));
    if (address.toLowerCase() === f.factory.toLowerCase()) {
      if (functionName === "escrows") {
        assert.equal(args[0], f.key);
        return registry;
      }
      return terms[functionName];
    }
    return functionName === "state"
      ? lifecycle
      : (changed[functionName] ?? terms[functionName]);
  },
};
const check = () =>
  verifyTradeEscrowPreflight(reader, binding, f.escrow, f.templates);
const verified = await check();
assert.equal(verified.disposition, "unfunded");
assert.equal(verified.fundingEnabled, false);
for (const k of Object.keys(terms)) {
  changed = {
    [k]:
      typeof terms[k] === "string"
        ? "0x" + "9".repeat(terms[k].length - 2)
        : terms[k] + 1n,
  };
  await assert.rejects(check, /term mismatch/);
}
changed = {};
chain++;
await assert.rejects(check, /network mismatch/);
chain = f.chainId;
code = "0x00" + f.escrowCode.slice(4);
await assert.rejects(check, /code does not match/);
code = f.escrowCode;
registry = f.factory;
await assert.rejects(check, /factory binding/);
registry = f.escrow;
reorg = true;
blockReads = 0;
await assert.rejects(check, /snapshot changed/);
reorg = false;
expired = true;
await assert.rejects(check, /deadline/);
expired = false;
headExpired = true;
await assert.rejects(check, /deadline/);
headExpired = false;
await assert.rejects(
  () =>
    verifyTradeEscrowPreflight(
      reader,
      { ...binding, contractTerms: { ...terms, amount: undefined } },
      f.escrow,
      f.templates,
    ),
  /Incomplete/,
);
headStateOverride = 2;
assert.equal((await check()).disposition, "state_confirmation_pending");
headStateOverride = undefined;
for (const state of [2, 3, 4, 5, 6, 7, 8, 9]) {
  lifecycle = state;
  assert.equal(
    (await check()).disposition,
    state <= 5 ? "already_funded" : "closed",
  );
}
lifecycle = 99;
await assert.rejects(check, /lifecycle/);
assert.throws(
  () =>
    assertTradeRuntime(f.escrowCode, {
      ...f.templates.escrow,
      immutableReferences: { bad: [{ start: 0, length: 1 }] },
    }),
  /immutable reference/,
);
const group = Object.values(f.templates.escrow.immutableReferences).find(
  (refs) => refs.length > 1,
);
assert.ok(group, "Fixture has repeated immutable values");
const at = 2 + (group[0].start + group[0].length) * 2 - 1;
const altered =
  f.escrowCode.slice(0, at) +
  (f.escrowCode[at] === "1" ? "2" : "1") +
  f.escrowCode.slice(at + 1);
assert.throws(
  () => assertTradeRuntime(altered, f.templates.escrow),
  /Inconsistent constructor value/,
);
console.log(
  "Trade preflight passed against real local EVM runtime fixtures: exact code with immutable slots, factory registry, every term, contract-wallet identities, pinned block, wrong chain/reorg/expiry rejection and no repeat funding.",
);
