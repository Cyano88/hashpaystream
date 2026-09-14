import { ethers } from "hardhat";
import { verifyXLayerStockOwnerSafe } from "./verify-stock-owner-safe";

async function main() {
  const address = String(
    process.env.HASHPAYSTREAM_STOCK_OWNER_MULTISIG ?? "",
  ).trim();
  const verified = await verifyXLayerStockOwnerSafe(ethers.provider, address);
  console.log(
    JSON.stringify(
      {
        chainId: verified.chainId.toString(),
        safe: verified.safe,
        version: verified.version,
        singleton: verified.singleton,
        owners: [...verified.owners].sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()),
        ),
        threshold: verified.threshold.toString(),
        modules: verified.modules,
        transactionGuard: verified.guard,
        moduleGuard: verified.moduleGuard,
        fallbackHandler: verified.fallbackHandler,
        policy: "CANONICAL_SAFE_1_5_0_2_OF_3_NO_MODULES_NO_GUARDS",
        verified: true,
      },
      null,
      2,
    ),
  );
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason);
  process.exitCode = 1;
});
