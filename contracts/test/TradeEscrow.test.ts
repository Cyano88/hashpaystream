import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
describe("TradeEscrow review candidate", () => {
  async function fixture(tokenName = "MockUSDC") {
    const [buyer, seller, arbiter, outsider] = await ethers.getSigners();
    const token: any = await ethers.deployContract(tokenName);
    const hash = ethers.id("accepted terms"),
      evidence = ethers.id("evidence");
    const terms = {
      offerId: ethers.id("offer"),
      termsHash: hash,
      buyer: buyer.address,
      seller: seller.address,
      arbiter: arbiter.address,
      token: await token.getAddress(),
      amount: 10000000n,
      fundBy: (await time.latest()) + 86400,
      dispatchWindow: 86400,
      deliveryWindow: 172800,
      inspectionWindow: 172800,
    };
    const escrow: any = await ethers.deployContract("TradeEscrow", [terms]);
    await token.mint(buyer.address, 20000000n);
    await token.connect(buyer).approve(await escrow.getAddress(), 10000000n);
    const fund = async () => {
      await escrow.connect(seller).acceptTerms(hash);
      await escrow.connect(buyer).fund(hash);
    };
    const dispatch = async () => {
      await fund();
      await escrow.connect(seller).markDispatched(evidence);
    };
    return {
      buyer,
      seller,
      arbiter,
      outsider,
      token,
      escrow,
      terms,
      hash,
      evidence,
      fund,
      dispatch,
    };
  }
  it("binds both roles and exact terms, funds once, and ignores donations", async () => {
    const c = await fixture();
    await c.token.mint(await c.escrow.getAddress(), 1n);
    expect(await c.escrow.state()).eq(0n);
    await expect(c.escrow.fund(c.hash)).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
    await expect(c.escrow.acceptTerms(c.hash)).revertedWithCustomError(
      c.escrow,
      "Unauthorized",
    );
    await expect(
      c.escrow.connect(c.seller).acceptTerms(c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidTerms");
    await c.fund();
    await expect(c.escrow.fund(c.hash)).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
    await c.escrow.recoverExcess();
    expect(await c.token.balanceOf(await c.escrow.getAddress())).eq(
      c.terms.amount,
    );
  });
  it("enforces unfunded cancellation and expiry", async () => {
    const c = await fixture();
    await expect(
      c.escrow.connect(c.outsider).cancelUnfunded(),
    ).revertedWithCustomError(c.escrow, "Unauthorized");
    await c.escrow.connect(c.seller).acceptTerms(c.hash);
    await time.increaseTo(c.terms.fundBy);
    await expect(c.escrow.fund(c.hash)).revertedWithCustomError(
      c.escrow,
      "Deadline",
    );
    await c.escrow.cancelUnfunded();
    expect(await c.escrow.state()).eq(9n);
  });
  it("refunds missed dispatch exactly once at its boundary", async () => {
    const c = await fixture();
    await c.fund();
    await expect(c.escrow.refundUndispatched()).revertedWithCustomError(
      c.escrow,
      "Deadline",
    );
    await time.increaseTo(await c.escrow.dispatchBy());
    await expect(
      c.escrow.connect(c.seller).markDispatched(c.evidence),
    ).revertedWithCustomError(c.escrow, "Deadline");
    await c.escrow.refundUndispatched();
    expect(await c.token.balanceOf(c.buyer.address)).eq(20000000n);
    await expect(c.escrow.refundUndispatched()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
  });
  it("seller claims cannot start inspection, release funds or cause automatic refunds", async () => {
    const c = await fixture();
    await c.dispatch();
    await time.increase(300000);
    await expect(c.escrow.releaseAfterInspection()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
    await expect(
      c.escrow.connect(c.seller).confirmReceipt(),
    ).revertedWithCustomError(c.escrow, "Unauthorized");
    await expect(
      c.escrow.connect(c.arbiter).approveRelease(),
    ).revertedWithCustomError(c.escrow, "Unauthorized");
    await expect(c.escrow.refundUndispatched()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
  });
  it("starts inspection only after buyer receipt and releases exact principal once", async () => {
    const c = await fixture();
    await c.dispatch();
    await c.escrow.confirmReceipt();
    await expect(c.escrow.releaseAfterInspection()).revertedWithCustomError(
      c.escrow,
      "Deadline",
    );
    await time.increaseTo(await c.escrow.inspectUntil());
    await c.escrow.connect(c.outsider).releaseAfterInspection();
    expect(await c.token.balanceOf(c.seller.address)).eq(c.terms.amount);
    expect(await c.token.balanceOf(await c.escrow.getAddress())).eq(0n);
    await expect(c.escrow.approveRelease()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
  });
  it("dispute freezes release past inspection and only arbiter can split the principal", async () => {
    const c = await fixture();
    await c.dispatch();
    await c.escrow.confirmReceipt();
    await c.escrow.openDispute(c.evidence);
    await time.increase(500000);
    await expect(c.escrow.releaseAfterInspection()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
    await expect(c.escrow.approveRelease()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
    await expect(
      c.escrow.resolveDispute(1, c.evidence),
    ).revertedWithCustomError(c.escrow, "Unauthorized");
    await expect(
      c.escrow
        .connect(c.arbiter)
        .resolveDispute(c.terms.amount + 1n, c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidTerms");
    await c.escrow.connect(c.arbiter).resolveDispute(4000000n, c.evidence);
    expect(await c.token.balanceOf(c.buyer.address)).eq(14000000n);
    expect(await c.token.balanceOf(c.seller.address)).eq(6000000n);
    await expect(
      c.escrow.connect(c.arbiter).resolveDispute(0, c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidState");
  });
  it("lets a seller escalate a silent buyer after delivery deadline and refund voluntarily", async () => {
    const c = await fixture();
    await c.dispatch();
    await expect(
      c.escrow.connect(c.seller).openDispute(c.evidence),
    ).revertedWithCustomError(c.escrow, "Deadline");
    await time.increaseTo(await c.escrow.deliveryBy());
    await c.escrow.connect(c.seller).openDispute(c.evidence);
    expect(await c.escrow.state()).eq(5n);
    await c.escrow.connect(c.seller).refundBySeller(c.evidence);
    expect(await c.token.balanceOf(c.buyer.address)).eq(20000000n);
  });
  it("forbids undisputed arbiter payouts and supports explicit buyer release", async () => {
    const c = await fixture();
    await c.dispatch();
    await expect(
      c.escrow.connect(c.arbiter).resolveDispute(0, c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidState");
    await c.escrow.approveRelease();
    expect(await c.token.balanceOf(c.seller.address)).eq(c.terms.amount);
  });
  it("rejects invalid counterparties, windows, missing terms and evidence", async () => {
    const c = await fixture();
    for (const patch of [
      { arbiter: c.buyer.address },
      { inspectionWindow: 1 },
      { token: c.outsider.address },
      { termsHash: ethers.ZeroHash },
      { amount: 0 },
    ])
      await expect(
        ethers.deployContract("TradeEscrow", [{ ...c.terms, ...patch }]),
      ).reverted;
    await c.fund();
    await expect(
      c.escrow.connect(c.seller).markDispatched(ethers.ZeroHash),
    ).revertedWithCustomError(c.escrow, "InvalidEvidence");
  });
  it("factory fixes asset and authority, authenticates seller and rejects duplicate escrow for the same offer", async () => {
    const c = await fixture();
    const factory: any = await ethers.deployContract("TradeEscrowFactory", [
      await c.token.getAddress(),
      c.arbiter.address,
    ]);
    await expect(factory.create(c.terms)).revertedWithCustomError(
      factory,
      "Unauthorized",
    );
    await expect(
      factory
        .connect(c.seller)
        .create({ ...c.terms, arbiter: c.outsider.address }),
    ).revertedWithCustomError(factory, "InvalidConfiguration");
    await factory.connect(c.seller).create(c.terms);
    const key = await factory.offerKey(
      c.seller.address,
      c.buyer.address,
      c.terms.offerId,
    );
    const address = await factory.escrows(key);
    expect(address).not.eq(ethers.ZeroAddress);
    const escrow: any = await ethers.getContractAt("TradeEscrow", address);
    expect(await escrow.termsHash()).eq(c.hash);
    expect(await escrow.amount()).eq(c.terms.amount);
    await expect(
      factory.connect(c.seller).create(c.terms),
    ).revertedWithCustomError(factory, "DuplicateOffer");
  });
  it("rejects a buyer dispute after the disclosed inspection deadline", async () => {
    const c = await fixture();
    await c.dispatch();
    await c.escrow.confirmReceipt();
    await time.increaseTo(await c.escrow.inspectUntil());
    await expect(c.escrow.openDispute(c.evidence)).revertedWithCustomError(
      c.escrow,
      "Deadline",
    );
  });
  it("blocks token reentry during funding and preserves principal", async () => {
    const c = await fixture("ReentrantUSDC");
    await c.token.armCallback(
      await c.escrow.getAddress(),
      c.escrow.interface.encodeFunctionData("releaseAfterInspection"),
    );
    await c.fund();
    expect(await c.token.callbackBlocked()).eq(true);
    expect(await c.token.balanceOf(await c.escrow.getAddress())).eq(
      c.terms.amount,
    );
    expect(await c.escrow.state()).eq(2n);
  });
  it("rejects short funding and rolls back state and token movements", async () => {
    const c = await fixture("ShortTransferUSDC");
    await c.escrow.connect(c.seller).acceptTerms(c.hash);
    await expect(c.escrow.fund(c.hash)).revertedWithCustomError(
      c.escrow,
      "IncorrectFunding",
    );
    expect(await c.escrow.state()).eq(1n);
    expect(await c.token.balanceOf(await c.escrow.getAddress())).eq(0n);
    expect(await c.token.balanceOf(c.buyer.address)).eq(20000000n);
  });
  it("allows mutually agreed dispute settlement without an arbiter signature", async () => {
    const c = await fixture();
    await c.dispatch();
    await c.escrow.openDispute(c.evidence);
    await c.escrow.proposeSettlement(3000000n, c.evidence);
    await expect(
      c.escrow.acceptSettlement(1, 3000000n, c.evidence),
    ).revertedWithCustomError(c.escrow, "Unauthorized");
    await c.escrow.connect(c.seller).acceptSettlement(1, 3000000n, c.evidence);
    expect(await c.token.balanceOf(c.buyer.address)).eq(13000000n);
    expect(await c.token.balanceOf(c.seller.address)).eq(7000000n);
    await expect(
      c.escrow.connect(c.arbiter).resolveDispute(0, c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidState");
  });
  it("rejects stale, changed and withdrawn settlement proposals", async () => {
    const c = await fixture();
    await c.dispatch();
    await c.escrow.openDispute(c.evidence);
    await c.escrow.proposeSettlement(3000000n, c.evidence);
    await c.escrow.proposeSettlement(2000000n, c.hash);
    await expect(
      c.escrow.connect(c.seller).acceptSettlement(1, 3000000n, c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidTerms");
    await expect(
      c.escrow.connect(c.seller).acceptSettlement(2, 3000000n, c.hash),
    ).revertedWithCustomError(c.escrow, "InvalidTerms");
    await expect(
      c.escrow.connect(c.seller).withdrawSettlement(2),
    ).revertedWithCustomError(c.escrow, "Unauthorized");
    await c.escrow.withdrawSettlement(2);
    await expect(
      c.escrow.connect(c.seller).acceptSettlement(2, 2000000n, c.hash),
    ).revertedWithCustomError(c.escrow, "InvalidState");
    expect(await c.token.balanceOf(await c.escrow.getAddress())).eq(
      c.terms.amount,
    );
  });
  it("keeps mutual settlement participant-only and dispute-only", async () => {
    const c = await fixture();
    await c.dispatch();
    await expect(
      c.escrow.proposeSettlement(0, c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidState");
    await c.escrow.openDispute(c.evidence);
    await expect(
      c.escrow.connect(c.outsider).proposeSettlement(0, c.evidence),
    ).revertedWithCustomError(c.escrow, "Unauthorized");
    await expect(
      c.escrow.proposeSettlement(c.terms.amount + 1n, c.evidence),
    ).revertedWithCustomError(c.escrow, "InvalidTerms");
    await c.escrow
      .connect(c.seller)
      .proposeSettlement(c.terms.amount, c.evidence);
    await c.escrow.acceptSettlement(1, c.terms.amount, c.evidence);
    expect(await c.token.balanceOf(c.buyer.address)).eq(20000000n);
  });
});
