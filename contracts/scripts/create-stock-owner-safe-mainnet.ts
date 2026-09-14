import { Contract } from "ethers";
import { ethers } from "hardhat";
import {
  assertStockOwnerSafeCreationAuthorized,
  parseStockOwnerSafeSalt,
  planXLayerStockOwnerSafe,
} from "./stock-owner-safe-plan";
import {
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
  verifyXLayerStockOwnerSafe,
} from "./verify-stock-owner-safe";

const FACTORY_ABI = [
  "function createChainSpecificProxyWithNonceL2(address singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",
];

async function main() {
  const owners = [1, 2, 3].map((index) =>
    String(
      process.env[`HASHPAYSTREAM_STOCK_OWNER_SAFE_OWNER_${index}`] ?? ""
    ).trim()
  );
  const saltNonce = parseStockOwnerSafeSalt(
    String(process.env.HASHPAYSTREAM_STOCK_OWNER_SAFE_SALT_NONCE ?? "").trim()
  );
  const plan = await planXLayerStockOwnerSafe(
    ethers.provider,
    owners,
    saltNonce
  );
  if (plan.alreadyDeployed) {
    throw new Error(
      "The planned Safe address already has code; creation is refused."
    );
  }
  assertStockOwnerSafeCreationAuthorized(
    plan.planId,
    String(process.env.HASHPAYSTREAM_STOCK_OWNER_SAFE_CREATE_PLAN_ID ?? ""),
    String(process.env.HASHPAYSTREAM_STOCK_OWNER_SAFE_CREATE_CONFIRM ?? "")
  );

  const [creator] = await ethers.getSigners();
  if (!creator) {
    throw new Error("XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.");
  }

  const factory = new Contract(SAFE_PROXY_FACTORY, FACTORY_ABI, creator);
  const transaction = await factory.createChainSpecificProxyWithNonceL2(
    SAFE_L2_SINGLETON,
    plan.initializer,
    plan.saltNonce
  );
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Safe creation transaction did not succeed.");
  }
  const verified = await verifyXLayerStockOwnerSafe(
    ethers.provider,
    plan.predictedSafe
  );
  console.log(
    JSON.stringify(
      {
        chainId: verified.chainId.toString(),
        safe: verified.safe,
        owners: verified.owners,
        threshold: verified.threshold.toString(),
        creator: creator.address,
        planId: plan.planId,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        verified: true,
      },
      null,
      2
    )
  );
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason);
  process.exitCode = 1;
});
