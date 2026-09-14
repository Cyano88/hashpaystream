import { expect } from "chai";
import { Interface, MaxUint256, ZeroAddress } from "ethers";
import {
  assertStockOwnerSafeCreationAuthorized,
  buildStockOwnerSafeInitializer,
  normalizeStockOwnerSafeOwners,
  parseStockOwnerSafeSalt,
  predictChainSpecificSafeAddress,
  stockOwnerSafePlanId,
} from "../scripts/stock-owner-safe-plan";
import {
  SAFE_COMPATIBILITY_FALLBACK_HANDLER,
  SAFE_L2_SINGLETON,
} from "../scripts/verify-stock-owner-safe";

const owners = [
  "0x0000000000000000000000000000000000000103",
  "0x0000000000000000000000000000000000000101",
  "0x0000000000000000000000000000000000000102",
];

describe("X Layer stock owner Safe planning", function () {
  it("normalizes three unique owners deterministically", function () {
    expect(normalizeStockOwnerSafeOwners(owners)).to.deep.equal([
      "0x0000000000000000000000000000000000000101",
      "0x0000000000000000000000000000000000000102",
      "0x0000000000000000000000000000000000000103",
    ]);
    expect(() => normalizeStockOwnerSafeOwners(owners.slice(0, 2))).to.throw(
      "Exactly three"
    );
    expect(() =>
      normalizeStockOwnerSafeOwners([owners[0], owners[0], owners[1]])
    ).to.throw("distinct");
    expect(() =>
      normalizeStockOwnerSafeOwners([owners[0], owners[1], ZeroAddress])
    ).to.throw("non-zero");
  });

  it("accepts only an explicit non-zero uint256 decimal salt", function () {
    expect(parseStockOwnerSafeSalt("1")).to.equal(1n);
    expect(parseStockOwnerSafeSalt(MaxUint256.toString())).to.equal(MaxUint256);
    for (const invalid of ["", "0", "-1", "01", "1.0", "0x01"]) {
      expect(() => parseStockOwnerSafeSalt(invalid)).to.throw();
    }
    expect(() =>
      parseStockOwnerSafeSalt((MaxUint256 + 1n).toString())
    ).to.throw("uint256 max");
  });

  it("encodes only the reviewed 2-of-3 Safe setup", function () {
    const abi = new Interface([
      "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
    ]);
    const initializer = buildStockOwnerSafeInitializer(owners);
    const decoded = abi.decodeFunctionData("setup", initializer);
    expect([...decoded.owners]).to.deep.equal(
      normalizeStockOwnerSafeOwners(owners)
    );
    expect(decoded.threshold).to.equal(2n);
    expect(decoded.to).to.equal(ZeroAddress);
    expect(decoded.data).to.equal("0x");
    expect(decoded.fallbackHandler).to.equal(
      SAFE_COMPATIBILITY_FALLBACK_HANDLER
    );
    expect(decoded.paymentToken).to.equal(ZeroAddress);
    expect(decoded.payment).to.equal(0n);
    expect(decoded.paymentReceiver).to.equal(ZeroAddress);
  });

  it("binds owner order, singleton and X Layer into a deterministic address", function () {
    const initializer = buildStockOwnerSafeInitializer(owners);
    const proxyCreationCode = "0x6001600055";
    const first = predictChainSpecificSafeAddress(
      proxyCreationCode,
      initializer,
      1n
    );
    expect(first).to.equal(
      predictChainSpecificSafeAddress(proxyCreationCode, initializer, 1n)
    );
    expect(first).to.not.equal(
      predictChainSpecificSafeAddress(proxyCreationCode, initializer, 2n)
    );
    expect(initializer.toLowerCase()).not.to.include(
      SAFE_L2_SINGLETON.slice(2).toLowerCase()
    );
  });

  it("binds chain, factory and calldata into the plan ID", function () {
    const data = "0x1234";
    const factory = "0x0000000000000000000000000000000000000100";
    const planId = stockOwnerSafePlanId(196n, factory, data);
    expect(planId).to.equal(stockOwnerSafePlanId(196n, factory, data));
    expect(planId).to.not.equal(stockOwnerSafePlanId(1952n, factory, data));
    expect(planId).to.not.equal(
      stockOwnerSafePlanId(
        196n,
        "0x0000000000000000000000000000000000000101",
        data
      )
    );
    expect(planId).to.not.equal(stockOwnerSafePlanId(196n, factory, "0x1235"));
    expect(() => stockOwnerSafePlanId(196n, ZeroAddress, "invalid")).to.throw(
      "invalid"
    );
  });
  it("requires the exact plan ID and explicit creation phrase", function () {
    expect(() =>
      assertStockOwnerSafeCreationAuthorized(
        "0x1234",
        "0x1234",
        "CREATE_PINNED_XLAYER_SAFE_2_OF_3"
      )
    ).not.to.throw();
    expect(() =>
      assertStockOwnerSafeCreationAuthorized(
        "0x1234",
        "0xabcd",
        "CREATE_PINNED_XLAYER_SAFE_2_OF_3"
      )
    ).to.throw("plan ID");
    expect(() =>
      assertStockOwnerSafeCreationAuthorized("0x1234", "0x1234", "")
    ).to.throw("creation confirmation");
  });
});
