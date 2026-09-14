import {
  AbiCoder,
  Contract,
  Interface,
  MaxUint256,
  ZeroAddress,
  concat,
  getAddress,
  getCreate2Address,
  isAddress,
  keccak256,
  solidityPackedKeccak256,
  toBeHex,
  zeroPadValue,
  type Provider,
} from "ethers";
import {
  SAFE_COMPATIBILITY_FALLBACK_HANDLER,
  SAFE_COMPATIBILITY_FALLBACK_HANDLER_RUNTIME_HASH,
  SAFE_L2_RUNTIME_HASH,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_PROXY_FACTORY_RUNTIME_HASH,
  XLAYER_MAINNET_CHAIN_ID,
} from "./verify-stock-owner-safe";

const SAFE_SETUP = new Interface([
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
]);
const FACTORY_ABI = [
  "function proxyCreationCode() view returns (bytes)",
  "function createChainSpecificProxyWithNonceL2(address singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",
];

export type StockOwnerSafePlan = {
  chainId: bigint;
  owners: string[];
  threshold: bigint;
  saltNonce: bigint;
  initializer: string;
  predictedSafe: string;
  factory: string;
  singleton: string;
  transactionData: string;
  proxyCreationCodeHash: string;
  planId: string;
  alreadyDeployed: boolean;
};

const same = (left: string, right: string) =>
  getAddress(left) === getAddress(right);

export function parseStockOwnerSafeSalt(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(
      "HASHPAYSTREAM_STOCK_OWNER_SAFE_SALT_NONCE must be an unsigned decimal integer."
    );
  }
  const salt = BigInt(value);
  if (salt === 0n || salt > MaxUint256) {
    throw new Error("Safe salt nonce must be between 1 and uint256 max.");
  }
  return salt;
}

export function assertStockOwnerSafeCreationAuthorized(
  expectedPlanId: string,
  providedPlanId: string,
  confirmation: string
) {
  if (providedPlanId !== expectedPlanId) {
    throw new Error(
      "Exact Safe creation plan ID confirmation is missing or does not match."
    );
  }
  if (confirmation !== "CREATE_PINNED_XLAYER_SAFE_2_OF_3") {
    throw new Error("Explicit X Layer Safe creation confirmation is missing.");
  }
}
export function normalizeStockOwnerSafeOwners(values: string[]): string[] {
  if (values.length !== 3)
    throw new Error("Exactly three Safe owner addresses are required.");
  const owners = values.map((value) => {
    if (!isAddress(value) || same(value, ZeroAddress)) {
      throw new Error("Each Safe owner must be a non-zero EVM address.");
    }
    return getAddress(value);
  });
  if (new Set(owners.map((owner) => owner.toLowerCase())).size !== 3) {
    throw new Error("Safe owner addresses must be distinct.");
  }
  return owners.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function buildStockOwnerSafeInitializer(owners: string[]): string {
  return SAFE_SETUP.encodeFunctionData("setup", [
    normalizeStockOwnerSafeOwners(owners),
    2n,
    ZeroAddress,
    "0x",
    SAFE_COMPATIBILITY_FALLBACK_HANDLER,
    ZeroAddress,
    0n,
    ZeroAddress,
  ]);
}

export function stockOwnerSafePlanId(
  chainId: bigint,
  factory: string,
  transactionData: string
): string {
  if (!isAddress(factory) || !/^0x([0-9a-fA-F]{2})+$/.test(transactionData)) {
    throw new Error("Safe plan ID inputs are invalid.");
  }
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "bytes"],
      [chainId, getAddress(factory), transactionData]
    )
  );
}
export function predictChainSpecificSafeAddress(
  proxyCreationCode: string,
  initializer: string,
  saltNonce: bigint
): string {
  const deploymentData = concat([
    proxyCreationCode,
    zeroPadValue(toBeHex(BigInt(SAFE_L2_SINGLETON)), 32),
  ]);
  const salt = solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256"],
    [keccak256(initializer), saltNonce, XLAYER_MAINNET_CHAIN_ID]
  );
  return getCreate2Address(SAFE_PROXY_FACTORY, salt, keccak256(deploymentData));
}

function assertRuntime(name: string, code: string, expectedHash: string) {
  if (code === "0x" || keccak256(code) !== expectedHash) {
    throw new Error(
      `Pinned Safe ${name} runtime is unavailable or changed on X Layer.`
    );
  }
}

export async function planXLayerStockOwnerSafe(
  provider: Provider,
  owners: string[],
  saltNonce: bigint
): Promise<StockOwnerSafePlan> {
  if (saltNonce === 0n || saltNonce > MaxUint256) {
    throw new Error("Safe salt nonce must be between 1 and uint256 max.");
  }
  const normalizedOwners = normalizeStockOwnerSafeOwners(owners);
  const initializer = buildStockOwnerSafeInitializer(normalizedOwners);
  const factory = new Contract(SAFE_PROXY_FACTORY, FACTORY_ABI, provider);
  const [network, singletonCode, factoryCode, handlerCode, proxyCreationCode] =
    await Promise.all([
      provider.getNetwork(),
      provider.getCode(SAFE_L2_SINGLETON),
      provider.getCode(SAFE_PROXY_FACTORY),
      provider.getCode(SAFE_COMPATIBILITY_FALLBACK_HANDLER),
      factory.proxyCreationCode(),
    ]);
  if (network.chainId !== XLAYER_MAINNET_CHAIN_ID) {
    throw new Error(
      `Safe planning requires X Layer mainnet 196; received ${network.chainId}.`
    );
  }
  assertRuntime("singleton", singletonCode, SAFE_L2_RUNTIME_HASH);
  assertRuntime("proxy factory", factoryCode, SAFE_PROXY_FACTORY_RUNTIME_HASH);
  assertRuntime(
    "fallback handler",
    handlerCode,
    SAFE_COMPATIBILITY_FALLBACK_HANDLER_RUNTIME_HASH
  );
  const predictedSafe = predictChainSpecificSafeAddress(
    proxyCreationCode,
    initializer,
    saltNonce
  );
  const alreadyDeployed = (await provider.getCode(predictedSafe)) !== "0x";
  const transactionData = factory.interface.encodeFunctionData(
    "createChainSpecificProxyWithNonceL2",
    [SAFE_L2_SINGLETON, initializer, saltNonce]
  );
  if (!alreadyDeployed) {
    const simulated =
      await factory.createChainSpecificProxyWithNonceL2.staticCall(
        SAFE_L2_SINGLETON,
        initializer,
        saltNonce
      );
    if (!same(simulated, predictedSafe)) {
      throw new Error(
        "Safe factory simulation does not match the deterministic predicted address."
      );
    }
  }
  return {
    chainId: network.chainId,
    owners: normalizedOwners,
    threshold: 2n,
    saltNonce,
    initializer,
    predictedSafe,
    factory: SAFE_PROXY_FACTORY,
    singleton: SAFE_L2_SINGLETON,
    transactionData,
    proxyCreationCodeHash: keccak256(proxyCreationCode),
    planId: stockOwnerSafePlanId(
      network.chainId,
      SAFE_PROXY_FACTORY,
      transactionData
    ),
    alreadyDeployed,
  };
}
