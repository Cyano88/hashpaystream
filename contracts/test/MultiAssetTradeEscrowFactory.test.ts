import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("MultiAssetTradeEscrowFactory", () => {
  async function terms(token: string, arbiter: string, seller: string, buyer: string, label: string) {
    return {
      offerId: ethers.id(label),
      termsHash: ethers.id(`${label}:terms`),
      buyer,
      seller,
      arbiter,
      token,
      amount: 1000000n,
      fundBy: (await time.latest()) + 86400,
      dispatchWindow: 86400,
      deliveryWindow: 172800,
      inspectionWindow: 172800,
    };
  }

  it("allows multiple approved assets and rejects unapproved assets", async () => {
    const [buyer, seller, outsider] = await ethers.getSigners();
    const arbiter: any = await ethers.deployContract("TradeTestWallet", [outsider.address]);
    const first: any = await ethers.deployContract("MockUSDC");
    const second: any = await ethers.deployContract("MockUSDC");
    const factory: any = await ethers.deployContract("MultiAssetTradeEscrowFactory", [
      arbiter.target,
      [first.target],
    ]);

    expect(await factory.approvedTokens(first.target)).eq(true);
    expect(await factory.approvedTokenCount()).eq(1n);
    expect(await factory.approvedTokens(second.target)).eq(false);
    await expect(factory.connect(seller).create(await terms(second.target, arbiter.target, seller.address, buyer.address, "unapproved")))
      .revertedWithCustomError(factory, "TokenNotApproved");

    await arbiter.connect(outsider).execute(
      factory.target,
      factory.interface.encodeFunctionData("setTokenApproval", [second.target, true]),
    );
    expect(await factory.approvedTokenCount()).eq(2n);
    expect([await factory.approvedTokenAt(0), await factory.approvedTokenAt(1)].sort()).deep.eq([first.target, second.target].sort());

    const firstTerms = await terms(first.target, arbiter.target, seller.address, buyer.address, "first");
    const secondTerms = await terms(second.target, arbiter.target, seller.address, buyer.address, "second");
    await factory.connect(seller).create(firstTerms);
    await factory.connect(seller).create(secondTerms);
    expect(await factory.escrows(await factory.offerKey(seller.address, buyer.address, firstTerms.offerId))).not.eq(ethers.ZeroAddress);
    expect(await factory.escrows(await factory.offerKey(seller.address, buyer.address, secondTerms.offerId))).not.eq(ethers.ZeroAddress);
    await arbiter.connect(outsider).execute(factory.target, factory.interface.encodeFunctionData("setTokenApproval", [first.target, false]));
    expect(await factory.approvedTokenCount()).eq(1n);
    expect(await factory.approvedTokens(first.target)).eq(false);
    expect(await factory.approvedTokenAt(0)).eq(second.target);
  });

  it("rejects non-Safe arbiter and non-arbiter approval", async () => {
    const [buyer, seller, outsider] = await ethers.getSigners();
    const token: any = await ethers.deployContract("MockUSDC");
    await expect(ethers.deployContract("MultiAssetTradeEscrowFactory", [outsider.address, [token.target]])).revertedWithCustomError(
      await ethers.getContractFactory("MultiAssetTradeEscrowFactory"),
      "InvalidConfiguration",
    );
    const arbiter: any = await ethers.deployContract("TradeTestWallet", [outsider.address]);
    const factory: any = await ethers.deployContract("MultiAssetTradeEscrowFactory", [arbiter.target, []]);
    await expect(factory.connect(seller).setTokenApproval(token.target, true)).revertedWithCustomError(factory, "Unauthorized");
    void buyer;
  });
});
