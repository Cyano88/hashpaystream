import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
async function fixture(amount = 10000000n, tokenName = "MockUSDC") {
  const [buyer, seller, arbiter, outsider] = await ethers.getSigners();
  const token: any = await ethers.deployContract(tokenName);
  const hash = ethers.id("audit terms"),
    evidence = ethers.id("audit evidence");
  const terms = {
    offerId: ethers.id("audit offer"),
    termsHash: hash,
    buyer: buyer.address,
    seller: seller.address,
    arbiter: arbiter.address,
    token: await token.getAddress(),
    amount,
    fundBy: (await time.latest()) + 86400,
    dispatchWindow: 86400,
    deliveryWindow: 172800,
    inspectionWindow: 86400,
  };
  const escrow: any = await ethers.deployContract("TradeEscrow", [terms]),
    address = await escrow.getAddress();
  await token.mint(buyer.address, 2n * amount);
  await token.connect(buyer).approve(address, amount);
  await escrow.connect(seller).acceptTerms(hash);
  const fund = async () => {
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
    hash,
    evidence,
    terms,
    escrow,
    address,
    fund,
    dispatch,
  };
}
describe("Trade escrow audit regressions", () => {
  it("paused funding rolls back state, allowance and balances and can recover", async () => {
    const c = await fixture(10000000n, "PolicyUSDC");
    await c.token.setPaused(true);
    await expect(c.fund()).revertedWithCustomError(c.token, "IssuerRestricted");
    expect(await c.escrow.state()).eq(1n);
    expect(await c.escrow.dispatchBy()).eq(0n);
    expect(await c.token.balanceOf(c.address)).eq(0n);
    expect(await c.token.balanceOf(c.buyer.address)).eq(2n * c.terms.amount);
    expect(await c.token.allowance(c.buyer.address, c.address)).eq(
      c.terms.amount,
    );
    expect((await c.escrow.queryFilter(c.escrow.filters.Funded())).length).eq(
      0,
    );
    await c.token.setPaused(false);
    await c.fund();
    expect(await c.escrow.state()).eq(2n);
  });
  it("a blocked second split recipient rolls back the first payout atomically", async () => {
    const c = await fixture(10000000n, "PolicyUSDC");
    await c.dispatch();
    await c.escrow.openDispute(c.evidence);
    await c.token.setBlocked(c.seller.address, true);
    await expect(
      c.escrow.connect(c.arbiter).resolveDispute(4000000n, c.evidence),
    ).revertedWithCustomError(c.token, "IssuerRestricted");
    expect(await c.escrow.state()).eq(5n);
    expect(await c.token.balanceOf(c.buyer.address)).eq(c.terms.amount);
    expect(await c.token.balanceOf(c.seller.address)).eq(0n);
    expect(await c.token.balanceOf(c.address)).eq(c.terms.amount);
    expect((await c.escrow.queryFilter(c.escrow.filters.Settled())).length).eq(
      0,
    );
    await c.token.setBlocked(c.seller.address, false);
    await c.escrow.connect(c.arbiter).resolveDispute(4000000n, c.evidence);
    expect(await c.token.balanceOf(c.buyer.address)).eq(14000000n);
    expect(await c.token.balanceOf(c.seller.address)).eq(6000000n);
    expect((await c.escrow.queryFilter(c.escrow.filters.Settled())).length).eq(
      1,
    );
  });
  it("issuer pause cannot falsely finish an inspection release", async () => {
    const c = await fixture(10000000n, "PolicyUSDC");
    await c.dispatch();
    await c.escrow.confirmReceipt();
    await c.token.setPaused(true);
    await time.increaseTo(await c.escrow.inspectUntil());
    await expect(
      c.escrow.connect(c.outsider).releaseAfterInspection(),
    ).revertedWithCustomError(c.token, "IssuerRestricted");
    expect(await c.escrow.state()).eq(4n);
    expect(await c.token.balanceOf(c.address)).eq(c.terms.amount);
    await c.token.setPaused(false);
    await c.escrow.connect(c.outsider).releaseAfterInspection();
    expect(await c.escrow.state()).eq(6n);
  });
  it("admits a dispute at the last inspection second and keeps it frozen long after expiry", async () => {
    const c = await fixture();
    await c.dispatch();
    await c.escrow.confirmReceipt();
    await time.setNextBlockTimestamp(Number(await c.escrow.inspectUntil()) - 1);
    await c.escrow.openDispute(c.evidence);
    await time.increase(365 * 86400);
    await expect(c.escrow.releaseAfterInspection()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
    await expect(c.escrow.refundUndispatched()).revertedWithCustomError(
      c.escrow,
      "InvalidState",
    );
    await c.escrow.recoverExcess();
    expect(await c.token.balanceOf(c.address)).eq(c.terms.amount);
    expect(await c.escrow.state()).eq(5n);
  });
  it("rejects disputes exactly at inspection expiry and permits release at that boundary", async () => {
    const c = await fixture();
    await c.dispatch();
    await c.escrow.confirmReceipt();
    await time.setNextBlockTimestamp(await c.escrow.inspectUntil());
    await expect(c.escrow.openDispute(c.evidence)).revertedWithCustomError(
      c.escrow,
      "Deadline",
    );
    await c.escrow.releaseAfterInspection();
    expect(await c.escrow.state()).eq(6n);
  });
  it("allows dispatch in the final second but rejects it exactly at the dispatch deadline", async () => {
    const first = await fixture();
    await first.fund();
    await time.setNextBlockTimestamp(
      Number(await first.escrow.dispatchBy()) - 1,
    );
    await first.escrow.connect(first.seller).markDispatched(first.evidence);
    expect(await first.escrow.state()).eq(3n);
    const second = await fixture();
    await second.fund();
    await time.setNextBlockTimestamp(await second.escrow.dispatchBy());
    await expect(
      second.escrow.connect(second.seller).markDispatched(second.evidence),
    ).revertedWithCustomError(second.escrow, "Deadline");
    await second.escrow.refundUndispatched();
    expect(await second.escrow.state()).eq(7n);
  });
  // Fixed seed makes accounting cases repeatable. This is bounded generated coverage, not exhaustive fuzzing.
  let seed = 0x51a7;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return BigInt(seed);
  }
  for (let sample = 0; sample < 24; sample++)
    it(`conserves principal and donations across terminal path ${sample % 8}, sample ${sample}`, async () => {
      const amount = sample === 0 ? 1n : random() * 1000n + 1n,
        donation = (random() % 1000000n) + 1n;
      const c = await fixture(amount),
        mode = sample % 8;
      await c.token.mint(c.address, donation);
      let buyerPayout = 0n,
        terminal = 6n;
      if (mode === 7) {
        await c.escrow.cancelUnfunded();
        terminal = 9n;
      } else {
        await c.fund();
        await c.escrow.recoverExcess();
        expect(await c.token.balanceOf(c.address)).eq(amount);
        if (mode === 2) {
          await time.increaseTo(await c.escrow.dispatchBy());
          await c.escrow.refundUndispatched();
          buyerPayout = amount;
          terminal = 7n;
        } else if (mode === 3) {
          await c.escrow.connect(c.seller).refundBySeller(c.evidence);
          buyerPayout = amount;
          terminal = 7n;
        } else {
          await c.escrow.connect(c.seller).markDispatched(c.evidence);
          if (mode === 0) await c.escrow.approveRelease();
          else if (mode === 1) {
            await c.escrow.confirmReceipt();
            await time.increaseTo(await c.escrow.inspectUntil());
            await c.escrow.connect(c.outsider).releaseAfterInspection();
          } else {
            await c.escrow.openDispute(c.evidence);
            buyerPayout = mode === 5 ? amount : random() % (amount + 1n);
            terminal = 8n;
            if (mode === 4)
              await c.escrow
                .connect(c.arbiter)
                .resolveDispute(buyerPayout, c.evidence);
            else {
              await c.escrow.proposeSettlement(buyerPayout, c.evidence);
              await c.escrow
                .connect(c.seller)
                .acceptSettlement(1, buyerPayout, c.evidence);
            }
          }
        }
      }
      await c.escrow.recoverExcess();
      const buyerBalance = await c.token.balanceOf(c.buyer.address),
        sellerBalance = await c.token.balanceOf(c.seller.address);
      expect(await c.escrow.state()).eq(terminal);
      expect(await c.token.balanceOf(c.address)).eq(0n);
      expect(buyerBalance).eq(
        (mode === 7 ? 2n * amount : amount + buyerPayout) + donation,
      );
      expect(sellerBalance).eq(mode === 7 ? 0n : amount - buyerPayout);
      expect(buyerBalance + sellerBalance).eq(await c.token.totalSupply());
      const terminalCalls = [
        () => c.escrow.fund(c.hash),
        () => c.escrow.cancelUnfunded(),
        () => c.escrow.approveRelease(),
        () => c.escrow.releaseAfterInspection(),
        () => c.escrow.refundUndispatched(),
        () => c.escrow.connect(c.seller).refundBySeller(c.evidence),
        () => c.escrow.connect(c.arbiter).resolveDispute(0, c.evidence),
        () =>
          c.escrow
            .connect(c.seller)
            .acceptSettlement(1, buyerPayout, c.evidence),
      ];
      for (const call of terminalCalls) await expect(call()).reverted;
      expect(await c.escrow.state()).eq(terminal);
      expect(await c.token.balanceOf(c.buyer.address)).eq(buyerBalance);
      expect(await c.token.balanceOf(c.seller.address)).eq(sellerBalance);
      expect(
        (await c.escrow.queryFilter(c.escrow.filters.Settled())).length,
      ).eq(mode === 7 ? 0 : 1);
    });
});
