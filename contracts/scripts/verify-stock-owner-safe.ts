import {
  Contract,
  ZeroAddress,
  getAddress,
  isAddress,
  keccak256,
  type Provider,
} from "ethers";

export const XLAYER_MAINNET_CHAIN_ID = 196n;
export const SAFE_VERSION = "1.5.0";
export const SAFE_SENTINEL = "0x0000000000000000000000000000000000000001";
export const SAFE_L2_SINGLETON = "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e";
export const SAFE_L2_RUNTIME_HASH =
  "0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc";
export const SAFE_PROXY_FACTORY = "0x14F2982D601c9458F93bd70B218933A6f8165e7b";
export const SAFE_PROXY_FACTORY_RUNTIME_HASH =
  "0x967dae4cda22b0c9ef7f31b010bdc1ceb0af9904b0c3dc060b5302e4c18a4529";
export const SAFE_COMPATIBILITY_FALLBACK_HANDLER =
  "0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4";
export const SAFE_COMPATIBILITY_FALLBACK_HANDLER_RUNTIME_HASH =
  "0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc";

const GUARD_STORAGE_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const MODULE_GUARD_STORAGE_SLOT =
  "0xb104e0b93118902c651344349b610029d694cfdec91c589c91ebafbcd0289947";
const FALLBACK_HANDLER_STORAGE_SLOT =
  "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";

const SAFE_ABI = [
  "function masterCopy() view returns (address)",
  "function VERSION() view returns (string)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
];

export type StockOwnerSafeSnapshot = {
  chainId: bigint;
  safe: string;
  proxyHasCode: boolean;
  singleton: string;
  singletonRuntimeHash: string;
  proxyFactoryRuntimeHash: string;
  fallbackHandler: string;
  fallbackHandlerRuntimeHash: string;
  version: string;
  owners: string[];
  threshold: bigint;
  modules: string[];
  nextModule: string;
  guard: string;
  moduleGuard: string;
};

const same = (left: string, right: string) =>
  getAddress(left) === getAddress(right);

export function assertXLayerStockOwnerSafe(
  snapshot: StockOwnerSafeSnapshot,
): StockOwnerSafeSnapshot {
  if (snapshot.chainId !== XLAYER_MAINNET_CHAIN_ID)
    throw new Error(
      `Owner Safe verification requires X Layer mainnet 196; received ${snapshot.chainId}.`,
    );
  if (
    !isAddress(snapshot.safe) ||
    same(snapshot.safe, ZeroAddress) ||
    !snapshot.proxyHasCode
  )
    throw new Error("Stock owner Safe must be a deployed non-zero contract.");
  if (
    !same(snapshot.singleton, SAFE_L2_SINGLETON) ||
    snapshot.singletonRuntimeHash !== SAFE_L2_RUNTIME_HASH
  )
    throw new Error(
      "Stock owner Safe does not use the pinned canonical SafeL2 v1.5.0 singleton.",
    );
  if (snapshot.proxyFactoryRuntimeHash !== SAFE_PROXY_FACTORY_RUNTIME_HASH)
    throw new Error(
      "Canonical Safe v1.5.0 proxy factory runtime is unavailable or changed on X Layer.",
    );
  if (snapshot.version !== SAFE_VERSION)
    throw new Error(`Stock owner Safe version must be ${SAFE_VERSION}.`);
  if (snapshot.owners.length !== 3)
    throw new Error("Stock owner Safe must have exactly 3 owners.");
  const owners = snapshot.owners.map((owner) => {
    if (
      !isAddress(owner) ||
      same(owner, ZeroAddress) ||
      same(owner, snapshot.safe)
    )
      throw new Error("Stock owner Safe contains an invalid owner.");
    return getAddress(owner);
  });
  if (
    new Set(owners.map((owner) => owner.toLowerCase())).size !== owners.length
  )
    throw new Error("Stock owner Safe owners must be distinct.");
  if (snapshot.threshold !== 2n)
    throw new Error("Stock owner Safe must require exactly 2 of 3 owners.");
  if (
    snapshot.modules.length !== 0 ||
    !same(snapshot.nextModule, SAFE_SENTINEL)
  )
    throw new Error("Stock owner Safe must not have enabled modules.");
  if (!same(snapshot.guard, ZeroAddress))
    throw new Error("Stock owner Safe must not have a transaction guard.");
  if (!same(snapshot.moduleGuard, ZeroAddress))
    throw new Error("Stock owner Safe must not have a module guard.");
  if (
    !same(snapshot.fallbackHandler, SAFE_COMPATIBILITY_FALLBACK_HANDLER) ||
    snapshot.fallbackHandlerRuntimeHash !==
      SAFE_COMPATIBILITY_FALLBACK_HANDLER_RUNTIME_HASH
  ) {
    throw new Error(
      "Stock owner Safe must use the pinned canonical Safe v1.5.0 compatibility fallback handler.",
    );
  }
  return { ...snapshot, safe: getAddress(snapshot.safe), owners };
}

function storageAddress(word: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(word))
    throw new Error("Safe storage value is not a 32-byte word.");
  return getAddress(`0x${word.slice(-40)}`);
}

function runtimeHash(code: string) {
  if (code === "0x")
    throw new Error("Pinned Safe dependency is not deployed on X Layer.");
  return keccak256(code);
}

export async function verifyXLayerStockOwnerSafe(
  provider: Provider,
  safeAddress: string,
) {
  if (!isAddress(safeAddress) || same(safeAddress, ZeroAddress))
    throw new Error(
      "HASHPAYSTREAM_STOCK_OWNER_MULTISIG must be a non-zero EVM address.",
    );
  const safe = getAddress(safeAddress);
  const wallet = new Contract(safe, SAFE_ABI, provider);
  const [
    network,
    proxyCode,
    singleton,
    version,
    owners,
    threshold,
    page,
    guardWord,
    moduleGuardWord,
    fallbackWord,
    singletonCode,
    factoryCode,
    handlerCode,
  ] = await Promise.all([
    provider.getNetwork(),
    provider.getCode(safe),
    wallet.masterCopy(),
    wallet.VERSION(),
    wallet.getOwners(),
    wallet.getThreshold(),
    wallet.getModulesPaginated(SAFE_SENTINEL, 10n),
    provider.getStorage(safe, GUARD_STORAGE_SLOT),
    provider.getStorage(safe, MODULE_GUARD_STORAGE_SLOT),
    provider.getStorage(safe, FALLBACK_HANDLER_STORAGE_SLOT),
    provider.getCode(SAFE_L2_SINGLETON),
    provider.getCode(SAFE_PROXY_FACTORY),
    provider.getCode(SAFE_COMPATIBILITY_FALLBACK_HANDLER),
  ]);
  return assertXLayerStockOwnerSafe({
    chainId: network.chainId,
    safe,
    proxyHasCode: proxyCode !== "0x",
    singleton,
    singletonRuntimeHash: runtimeHash(singletonCode),
    proxyFactoryRuntimeHash: runtimeHash(factoryCode),
    fallbackHandler: storageAddress(fallbackWord),
    fallbackHandlerRuntimeHash: runtimeHash(handlerCode),
    version,
    owners: [...owners],
    threshold,
    modules: [...page[0]],
    nextModule: page[1],
    guard: storageAddress(guardWord),
    moduleGuard: storageAddress(moduleGuardWord),
  });
}
