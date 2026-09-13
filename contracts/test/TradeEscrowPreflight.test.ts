import { expect } from "chai";
import { ethers, artifacts } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import fs from "node:fs";
import path from "node:path";
describe("Trade contract wallet and preflight fixture", () => {
  it("executes seller creation and buyer approval/funding/receipt through contract wallets", async () => {
    const [buyerOwner, sellerOwner, arbiter, outsider] =
      await ethers.getSigners();
    const buyer: any = await ethers.deployContract("TradeTestWallet", [
        buyerOwner.address,
      ]),
      seller: any = await ethers.deployContract("TradeTestWallet", [
        sellerOwner.address,
      ]);
    const token: any = await ethers.deployContract("MockUSDC");
    const factory: any = await ethers.deployContract("TradeEscrowFactory", [
      token.target,
      arbiter.address,
    ]);
    const terms = {
      offerId: ethers.id("fixture offer"),
      termsHash: ethers.id("fixture terms"),
      buyer: await buyer.getAddress(),
      seller: await seller.getAddress(),
      arbiter: arbiter.address,
      token: await token.getAddress(),
      amount: 10000000n,
      fundBy: (await time.latest()) + 86400,
      dispatchWindow: 86400,
      deliveryWindow: 172800,
      inspectionWindow: 172800,
    };
    await expect(
      seller
        .connect(outsider)
        .execute(
          factory.target,
          factory.interface.encodeFunctionData("create", [terms]),
        ),
    ).revertedWith("Only owner");
    await seller
      .connect(sellerOwner)
      .execute(
        factory.target,
        factory.interface.encodeFunctionData("create", [terms]),
      );
    const key = await factory.offerKey(
      terms.seller,
      terms.buyer,
      terms.offerId,
    );
    const escrow: any = await ethers.getContractAt(
      "TradeEscrow",
      await factory.escrows(key),
    );
    await seller
      .connect(sellerOwner)
      .execute(
        escrow.target,
        escrow.interface.encodeFunctionData("acceptTerms", [terms.termsHash]),
      );
    await time.advanceBlock();
    const head = await ethers.provider.getBlockNumber(),
      block = await ethers.provider.getBlock(head - 1);
    if (!block) throw Error("Block missing");
    const templates: any = {};
    for (const [kind, name] of [
      ["factory", "TradeEscrowFactory"],
      ["escrow", "TradeEscrow"],
    ]) {
      const info = await artifacts.getBuildInfo("src/" + name + ".sol:" + name);
      if (!info) throw Error("Build missing");
      const code =
        info.output.contracts["src/" + name + ".sol"][name].evm
          .deployedBytecode;
      templates[kind] = {
        bytecode: "0x" + code.object,
        immutableReferences: code.immutableReferences,
      };
    }
    const fixture = {
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      factory: await factory.getAddress(),
      escrow: await escrow.getAddress(),
      key,
      terms,
      head,
      block: { hash: block.hash, timestamp: block.timestamp },
      headTimestamp: (await ethers.provider.getBlock(head))!.timestamp,
      factoryCode: await ethers.provider.getCode(factory.target, head - 1),
      escrowCode: await ethers.provider.getCode(escrow.target, head - 1),
      templates,
      state: Number(await escrow.state({ blockTag: head - 1 })),
    };
    fs.mkdirSync(path.resolve("../output/playwright"), { recursive: true });
    fs.writeFileSync(
      path.resolve("../output/playwright/trade-preflight-evm-fixture.json"),
      JSON.stringify(
        fixture,
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ),
    );
    await token.mint(buyer.target, terms.amount);
    await buyer.execute(
      token.target,
      token.interface.encodeFunctionData("approve", [
        escrow.target,
        terms.amount,
      ]),
    );
    await buyer.execute(
      escrow.target,
      escrow.interface.encodeFunctionData("fund", [terms.termsHash]),
    );
    expect(await token.balanceOf(escrow.target)).eq(terms.amount);
    await expect(
      escrow.connect(buyerOwner).approveRelease(),
    ).revertedWithCustomError(escrow, "Unauthorized");
    await seller
      .connect(sellerOwner)
      .execute(
        escrow.target,
        escrow.interface.encodeFunctionData("markDispatched", [
          ethers.id("tracking evidence"),
        ]),
      );
    await buyer.execute(
      escrow.target,
      escrow.interface.encodeFunctionData("confirmReceipt"),
    );
    await buyer.execute(
      escrow.target,
      escrow.interface.encodeFunctionData("approveRelease"),
    );
    expect(await token.balanceOf(seller.target)).eq(terms.amount);
    expect(await token.balanceOf(escrow.target)).eq(0n);
  });
});
