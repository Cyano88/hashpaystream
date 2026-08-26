import assert from "node:assert/strict";
import { createPublicClient, formatEther, formatUnits, getAddress, http } from "viem";
import { xLayer } from "viem/chains";

const escrow = getAddress("0x9065c996672E9FE8f9F13F1DE6c9DF23d4A17D3E");
const configuredFunderValue = String(process.env.HASHPAYSTREAM_READINESS_FUNDER_ADDRESS ?? "").trim();
const configuredFunder = configuredFunderValue ? getAddress(configuredFunderValue) : null;
const expected = {
  owner: getAddress("0x8f1B15FC1489262Ce64AC8d6592bC8Ebb31f07bE"),
  asset: getAddress("0x74b7F16337b8972027F6196A17a631aC6dE26d22"),
  router: getAddress("0x0E47e6dD4f86C5Cf1843Dce310b710FaE64c0C16"),
  underwritingSigner: getAddress("0xB089C3d5F06074856d7665A1Aa53Dc0d761930aE"),
  protectionSigner: getAddress("0xfd23c4697e41Bb6874d72D5f2b56Af8aB00CAb99"),
};
const escrowAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "arcRepaymentRouter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "underwritingSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "protectionSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowedFunders",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
];
const legacyCapAbi = [{ type: "function", name: "maxAdvanceAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }];
const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];
const client = createPublicClient({
  chain: xLayer,
  transport: http("https://rpc.xlayer.tech"),
});

const [
  owner,
  asset,
  router,
  underwritingSigner,
  protectionSigner,
  paused,
  allowed,
  gasBalance,
  usdcBalance,
] = await Promise.all([
  client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "owner",
  }),
  client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "asset",
  }),
  client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "arcRepaymentRouter",
  }),
  client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "underwritingSigner",
  }),
  client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "protectionSigner",
  }),
  client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "paused",
  }),
  configuredFunder ? client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "allowedFunders",
    args: [configuredFunder],
  }) : false,
  configuredFunder ? client.getBalance({ address: configuredFunder }) : 0n,
  configuredFunder ? client.readContract({
    address: expected.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [configuredFunder],
  }) : 0n,
]);

assert.equal(getAddress(owner), expected.owner, "Escrow owner drifted.");
assert.equal(getAddress(asset), expected.asset, "Escrow asset drifted.");
assert.equal(
  getAddress(router),
  expected.router,
  "Arc repayment router drifted.",
);
assert.equal(
  getAddress(underwritingSigner),
  expected.underwritingSigner,
  "Underwriting signer drifted.",
);
assert.equal(
  getAddress(protectionSigner),
  expected.protectionSigner,
  "Protection signer drifted.",
);
const legacyCap = await client.readContract({ address: escrow, abi: legacyCapAbi, functionName: "maxAdvanceAmount" }).catch(() => undefined);
assert.equal(legacyCap, undefined, "Configured escrow is the legacy globally capped deployment. Deploy the production escrow and update configuration.");

const activationBlockers = [];
if (paused) activationBlockers.push("ESCROW_PAUSED");
if (!configuredFunder) activationBlockers.push("FUNDER_NOT_SELECTED");
else if (!allowed) activationBlockers.push("FUNDER_NOT_ALLOWLISTED");

console.log(
  JSON.stringify(
    {
      ok: activationBlockers.length === 0,
      network: "X Layer Mainnet",
      escrow,
      paused,
      configuredFunder,
      configuredFunderAllowed: allowed,
      configuredFunderOkb: formatEther(gasBalance),
      configuredFunderUsdc: formatUnits(usdcBalance, 6),
      globalSpendingCap: false,
      activationBlockers,
    },
    null,
    2,
  ),
);

if (activationBlockers.length > 0) process.exitCode = 1;
