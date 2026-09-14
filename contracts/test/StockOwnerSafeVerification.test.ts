import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ZeroAddress } from "ethers";
import {
  SAFE_COMPATIBILITY_FALLBACK_HANDLER,
  SAFE_COMPATIBILITY_FALLBACK_HANDLER_RUNTIME_HASH,
  SAFE_L2_RUNTIME_HASH,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_PROXY_FACTORY_RUNTIME_HASH,
  SAFE_SENTINEL,
  assertXLayerStockOwnerSafe,
  type StockOwnerSafeSnapshot,
} from "../scripts/verify-stock-owner-safe";

const valid = (): StockOwnerSafeSnapshot => ({
  chainId: 196n,
  safe: "0x0000000000000000000000000000000000000100",
  proxyHasCode: true,
  singleton: SAFE_L2_SINGLETON,
  singletonRuntimeHash: SAFE_L2_RUNTIME_HASH,
  proxyFactoryRuntimeHash: SAFE_PROXY_FACTORY_RUNTIME_HASH,
  fallbackHandler: SAFE_COMPATIBILITY_FALLBACK_HANDLER,
  fallbackHandlerRuntimeHash: SAFE_COMPATIBILITY_FALLBACK_HANDLER_RUNTIME_HASH,
  version: "1.5.0",
  owners: [
    "0x0000000000000000000000000000000000000101",
    "0x0000000000000000000000000000000000000102",
    "0x0000000000000000000000000000000000000103",
  ],
  threshold: 2n,
  modules: [],
  nextModule: SAFE_SENTINEL,
  guard: ZeroAddress,
  moduleGuard: ZeroAddress,
});

describe("X Layer stock owner Safe verification", function () {
  it("accepts only the pinned canonical 2-of-3 shape", function () {
    expect(assertXLayerStockOwnerSafe(valid()).owners).to.have.length(3);
  });

  it("matches the hash-pinned Safe policy evidence", function () {
    const policy = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../docs/evidence/stock-owner-safe-policy.json"),
        "utf8",
      ),
    );
    expect(policy.chain.chainId).to.equal(196);
    expect(policy.dependencies.safeL2Singleton).to.deep.equal({
      address: SAFE_L2_SINGLETON,
      runtimeKeccak256: SAFE_L2_RUNTIME_HASH,
    });
    expect(policy.dependencies.safeProxyFactory).to.deep.equal({
      address: SAFE_PROXY_FACTORY,
      runtimeKeccak256: SAFE_PROXY_FACTORY_RUNTIME_HASH,
    });
    expect(policy.dependencies.compatibilityFallbackHandler).to.deep.equal({
      address: SAFE_COMPATIBILITY_FALLBACK_HANDLER,
      runtimeKeccak256: SAFE_COMPATIBILITY_FALLBACK_HANDLER_RUNTIME_HASH,
    });
    expect(policy.requiredSafeShape).to.include({
      owners: 3,
      threshold: 2,
      enabledModules: 0,
    });
    expect(policy.ready).to.equal(false);
  });

  for (const [name, patch, message] of [
    ["chain", { chainId: 1952n }, "X Layer mainnet 196"],
    ["proxy code", { proxyHasCode: false }, "deployed non-zero contract"],
    [
      "singleton",
      { singleton: "0x0000000000000000000000000000000000000999" },
      "canonical SafeL2",
    ],
    [
      "singleton runtime",
      { singletonRuntimeHash: "0x" + "11".repeat(32) },
      "canonical SafeL2",
    ],
    [
      "factory runtime",
      { proxyFactoryRuntimeHash: "0x" + "22".repeat(32) },
      "proxy factory runtime",
    ],
    ["version", { version: "1.4.1" }, "version must be 1.5.0"],
    ["owner count", { owners: valid().owners.slice(0, 2) }, "exactly 3 owners"],
    ["threshold", { threshold: 1n }, "exactly 2 of 3"],
    [
      "modules",
      { modules: ["0x0000000000000000000000000000000000000200"] },
      "must not have enabled modules",
    ],
    [
      "transaction guard",
      { guard: "0x0000000000000000000000000000000000000201" },
      "must not have a transaction guard",
    ],
    [
      "module guard",
      { moduleGuard: "0x0000000000000000000000000000000000000202" },
      "must not have a module guard",
    ],
    [
      "fallback handler",
      { fallbackHandler: ZeroAddress },
      "compatibility fallback handler",
    ],
    [
      "fallback runtime",
      { fallbackHandlerRuntimeHash: "0x" + "33".repeat(32) },
      "compatibility fallback handler",
    ],
  ] as const) {
    it("rejects an invalid " + name, function () {
      expect(() =>
        assertXLayerStockOwnerSafe({ ...valid(), ...patch }),
      ).to.throw(message);
    });
  }

  it("rejects duplicate and self-owned owner sets", function () {
    const duplicate = valid();
    duplicate.owners[2] = duplicate.owners[0];
    expect(() => assertXLayerStockOwnerSafe(duplicate)).to.throw("distinct");
    const selfOwned = valid();
    selfOwned.owners[2] = selfOwned.safe;
    expect(() => assertXLayerStockOwnerSafe(selfOwned)).to.throw(
      "invalid owner",
    );
  });
});
