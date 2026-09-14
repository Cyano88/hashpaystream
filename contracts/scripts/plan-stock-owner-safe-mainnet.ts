import { ethers } from "hardhat";
import {
  parseStockOwnerSafeSalt,
  planXLayerStockOwnerSafe,
} from "./stock-owner-safe-plan";

async function main() {
  const owners = [1, 2, 3].map((index) =>
    String(
      process.env[`HASHPAYSTREAM_STOCK_OWNER_SAFE_OWNER_${index}`] ?? "",
    ).trim(),
  );
  const saltNonce = parseStockOwnerSafeSalt(
    String(process.env.HASHPAYSTREAM_STOCK_OWNER_SAFE_SALT_NONCE ?? "").trim(),
  );
  const plan = await planXLayerStockOwnerSafe(
    ethers.provider,
    owners,
    saltNonce,
  );
  console.log(
    JSON.stringify(
      {
        chainId: plan.chainId.toString(),
        policy: "CANONICAL_SAFE_1_5_0_2_OF_3_NO_MODULES_NO_GUARDS",
        owners: plan.owners,
        threshold: plan.threshold.toString(),
        saltNonce: plan.saltNonce.toString(),
        predictedSafe: plan.predictedSafe,
        factory: plan.factory,
        singleton: plan.singleton,
        transactionData: plan.transactionData,
        transactionDataKeccak256: ethers.keccak256(plan.transactionData),
        proxyCreationCodeHash: plan.proxyCreationCodeHash,
        planId: plan.planId,
        alreadyDeployed: plan.alreadyDeployed,
        broadcast: false,
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
