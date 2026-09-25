import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
} from "viem";
import { tradeUnits, validateTradeTerms } from "../src/lib/tradeAgreement.js";

// Internal preparation primitive. The caller must load the accepted offer and full
// snapshot from storage and verify wallet ownership. This does not authorize funding.
export type TradeBindingInput = {
  offer: {
    id: string;
    status: string;
    listingRevision: number;
    terms: unknown;
    snapshot: Record<string, unknown>;
  };
  chainId: 196 | 5042002;
  factory: string;
  buyer: string;
  seller: string;
  arbiter: string;
  fundBy: number;
  now: number;
  env?: NodeJS.ProcessEnv;
};
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  throw Error("Unsupported agreement snapshot value.");
}
function address(value: string): Address {
  if (!isAddress(value) || /^0x0{40}$/i.test(value))
    throw Error("Invalid escrow participant or factory.");
  return getAddress(value);
}
export function configuredXLayerAssets(env: NodeJS.ProcessEnv): Map<string, { address: Address; decimals: number }> {
  const file = env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_FILE?.trim();
  const raw = env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON?.trim();
  let entries: unknown;
  try {
    const source = file ? readFileSync(file, "utf8").replace(/^\uFEFF/, "") : raw;
    const parsed = source ? JSON.parse(source) : undefined;
    entries = file && parsed && !Array.isArray(parsed) ? (parsed as { assets?: unknown }).assets : parsed;
  } catch {
    throw Error(file ? `X Layer tokenized-asset registry file is invalid: ${file}` : "X Layer tokenized-asset registry JSON is invalid.");
  }
  if (!entries) entries = env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSET_ADDRESS ? [{ address: env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSET_ADDRESS, decimals: Number(env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSET_DECIMALS ?? "") }] : [];
  if (!Array.isArray(entries)) throw Error("X Layer tokenized-asset registry must be a JSON array.");
  const result = new Map<string, { address: Address; decimals: number }>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") throw Error("X Layer tokenized-asset registry entry is invalid.");
    const value = entry as Record<string, unknown>;
    const token = String(value.address ?? "");
    const decimals = Number(value.decimals);
    if (!isAddress(token) || /^0x0{40}$/i.test(token) || !Number.isInteger(decimals) || decimals < 2 || decimals > 18) throw Error("X Layer tokenized-asset registry entry is invalid.");
    const normalized = getAddress(token);
    const key = normalized.toLowerCase();
    if (result.has(key)) throw Error("X Layer tokenized-asset registry contains a duplicate token.");
    result.set(key, { address: normalized, decimals });
  }
  return result;
}
export function prepareTradeEscrowBinding(input: TradeBindingInput) {
  const { offer } = input;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      offer.id,
    ) ||
    offer.status !== "accepted" ||
    !Number.isSafeInteger(offer.listingRevision) ||
    offer.listingRevision < 1
  )
    throw Error("A valid accepted offer is required.");
  const terms = validateTradeTerms(offer.terms);
  const settlementAsset = terms.settlementAsset ?? "USDC";
  if (terms.currency !== "USDC" && terms.currency !== "XLAYER_ASSET") throw Error("A separately accepted on-chain settlement quote is required.");
  if (terms.currency === "USDC" && settlementAsset !== "USDC") throw Error("USDC quotes must settle in USDC.");
  if (terms.currency === "XLAYER_ASSET" && settlementAsset !== "XLAYER_TOKENIZED_ASSET") throw Error("X Layer asset quotes must settle in the configured tokenized asset.");
  if (settlementAsset !== "USDC" && settlementAsset !== "XLAYER_TOKENIZED_ASSET")
    throw Error("A separately accepted settlement asset is required.");
  const assets: Record<number, Address> = {
    196: "0xB6CEceAB302E2E4948951eE7843FC24E92933061",
    5042002: "0x3600000000000000000000000000000000000000",
  };
  if (!assets[input.chainId]) throw Error("Unsupported settlement chain.");
  if (
    !Number.isSafeInteger(input.now) ||
    input.now < 0 ||
    !Number.isSafeInteger(input.fundBy) ||
    input.fundBy <= input.now ||
    input.fundBy > input.now + 7 * 86400
  )
    throw Error("Invalid funding deadline.");
  const factory = address(input.factory),
    buyer = address(input.buyer),
    seller = address(input.seller),
    arbiter = address(input.arbiter);
  let token = getAddress(assets[input.chainId]);
  let tokenDecimals = 6;
  if (settlementAsset === "XLAYER_TOKENIZED_ASSET") {
    if (input.chainId !== 196) throw Error("Tokenized-asset settlement is only supported on X Layer.");
    const registry = configuredXLayerAssets(input.env ?? process.env);
    if (!terms.settlementToken) throw Error("The accepted tokenized asset is not configured.");
    const configured = registry.get(getAddress(terms.settlementToken).toLowerCase());
    if (!configured) throw Error("The accepted tokenized asset is not in the approved X Layer registry.");
    token = configured.address;
    tokenDecimals = configured.decimals;
  }
  if (
    new Set(
      [factory, buyer, seller, arbiter, token].map((x) => x.toLowerCase()),
    ).size !== 5
  )
    throw Error("Escrow roles and token must be distinct.");
  if (
    !Array.isArray(offer.snapshot.photos) ||
    !offer.snapshot.photos.length ||
    offer.snapshot.photos.some(
      (p) => typeof p !== "string" || !p.startsWith("data:image/jpeg;base64,"),
    )
  )
    throw Error("The complete preserved listing snapshot is required.");
  const snapshotHash = createHash("sha256")
    .update(canonical(offer.snapshot))
    .digest("hex");
  const decimals = settlementAsset === "USDC" ? 6 : tokenDecimals;
  if (!Number.isInteger(decimals) || decimals < 2 || decimals > 18) throw Error("Settlement-asset decimals are not configured.");
  const amount = (tradeUnits(terms.price) + tradeUnits(terms.deliveryFee)) * 10n ** BigInt(decimals - 2);
  const core = {
    version: "trade-escrow-v1",
    chainId: input.chainId,
    factory,
    offerId: offer.id.toLowerCase(),
    listingRevision: offer.listingRevision,
    snapshotHash,
    terms,
    buyer,
    seller,
    arbiter,
    token,
    settlementAsset,
    decimals,
    amount: amount.toString(),
    fundBy: input.fundBy,
  };
  const termsHash = keccak256(stringToHex(canonical(core)));
  return {
    chainId: input.chainId,
    factory,
    snapshotHash,
    termsHash,
    fundingEnabled: false as const,
    contractTerms: {
      offerId: keccak256(
        stringToHex("hashpaystream:trade:" + offer.id.toLowerCase()),
      ),
      termsHash,
      buyer,
      seller,
      arbiter,
      token,
      settlementAsset,
      decimals,
      amount,
      fundBy: input.fundBy,
      dispatchWindow: terms.dispatchDays * 86400,
      deliveryWindow: terms.deliveryDays * 86400,
      inspectionWindow: terms.inspectionHours * 3600,
    },
  };
}
