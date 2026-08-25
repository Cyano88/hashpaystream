import assert from "node:assert/strict";
import { createPublicClient, formatEther, formatUnits, getAddress, http } from "viem";
import { xLayer } from "viem/chains";

const escrow = getAddress("0x790605cee123a37C16BB71fB9c12a33E72Eff41D");
const configuredFunder = getAddress(
  "0x85a530abbe102d1bf4fd084551944b0cdd94dbf4",
);
const expected = {
  owner: getAddress("0x988263A851Afe17F8a827EdA81269F9fb7553cbC"),
  asset: getAddress("0x74b7F16337b8972027F6196A17a631aC6dE26d22"),
  router: getAddress("0x0CFd91Ea2F476C62fE2008B14A5dFd4A61328CcE"),
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
  client.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "allowedFunders",
    args: [configuredFunder],
  }),
  client.getBalance({ address: configuredFunder }),
  client.readContract({
    address: expected.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [configuredFunder],
  }),
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
assert.equal(paused, false, "Escrow is paused.");
assert.equal(
  allowed,
  true,
  "Configured funding wallet is not allowlisted by the escrow.",
);
const legacyCap = await client.readContract({ address: escrow, abi: legacyCapAbi, functionName: "maxAdvanceAmount" }).catch(() => undefined);
assert.equal(legacyCap, undefined, "Configured escrow is the legacy globally capped deployment. Deploy the production escrow and update configuration.");

console.log(
  JSON.stringify(
    {
      ok: true,
      network: "X Layer Mainnet",
      escrow,
      paused,
      configuredFunder,
      configuredFunderAllowed: allowed,
      configuredFunderOkb: formatEther(gasBalance),
      configuredFunderUsdc: formatUnits(usdcBalance, 6),
      globalSpendingCap: false,
    },
    null,
    2,
  ),
);
