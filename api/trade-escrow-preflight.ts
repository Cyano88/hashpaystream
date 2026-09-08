import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import type { prepareTradeEscrowBinding } from "./trade-escrow-binding.js";
export type RuntimeTemplate = {
  bytecode: Hex;
  immutableReferences: Record<string, { start: number; length: number }[]>;
};
export type TradeEscrowReader = {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBlock(input: {
    blockNumber: bigint;
  }): Promise<{ hash: Hex | null; timestamp: bigint }>;
  getCode(input: {
    address: Address;
    blockNumber: bigint;
  }): Promise<Hex | undefined>;
  readContract(input: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }): Promise<unknown>;
};
const abi = parseAbi([
  "function token() view returns(address)",
  "function arbiter() view returns(address)",
  "function buyer() view returns(address)",
  "function seller() view returns(address)",
  "function offerId() view returns(bytes32)",
  "function termsHash() view returns(bytes32)",
  "function amount() view returns(uint256)",
  "function fundBy() view returns(uint64)",
  "function dispatchWindow() view returns(uint32)",
  "function deliveryWindow() view returns(uint32)",
  "function inspectionWindow() view returns(uint32)",
  "function state() view returns(uint8)",
  "function escrows(bytes32) view returns(address)",
]);
// Template and mask MUST come from the trusted build/review artifact, never the target RPC.
export function assertTradeRuntime(
  code: Hex | undefined,
  template: RuntimeTemplate,
) {
  if (
    !code ||
    !/^0x(?:[0-9a-f]{2})+$/i.test(code) ||
    !/^0x(?:[0-9a-f]{2})+$/i.test(template.bytecode) ||
    code.length !== template.bytecode.length
  )
    throw Error("Escrow code does not match the pinned template.");
  const actual = code.slice(2).toLowerCase().split(""),
    expected = template.bytecode.slice(2).toLowerCase().split(""),
    used = new Set<number>();
  for (const refs of Object.values(template.immutableReferences)) {
    let immutableWord: string | undefined;
    for (const ref of refs) {
      if (
        !Number.isInteger(ref.start) ||
        ref.start < 0 ||
        ref.length !== 32 ||
        (ref.start + ref.length) * 2 > actual.length
      )
        throw Error("Invalid compiler immutable reference.");
      const word = code
        .slice(2 + ref.start * 2, 2 + (ref.start + ref.length) * 2)
        .toLowerCase();
      if (immutableWord !== undefined && immutableWord !== word)
        throw Error("Inconsistent constructor value in runtime code.");
      immutableWord = word;
      for (let i = ref.start * 2; i < (ref.start + ref.length) * 2; i++) {
        if (used.has(i))
          throw Error("Overlapping compiler immutable references.");
        used.add(i);
        actual[i] = expected[i] = "0";
      }
    }
  }
  if (actual.join("") !== expected.join(""))
    throw Error("Escrow code does not match the pinned template.");
}
export async function verifyTradeEscrowPreflight(
  reader: TradeEscrowReader,
  binding: ReturnType<typeof prepareTradeEscrowBinding>,
  escrowAddress: Address,
  templates: { factory: RuntimeTemplate; escrow: RuntimeTemplate },
) {
  const escrow = getAddress(escrowAddress),
    factory = getAddress(binding.factory);
  if (escrow === factory || /^0x0{40}$/i.test(escrow))
    throw Error("Invalid escrow address.");
  if ((await reader.getChainId()) !== binding.chainId)
    throw Error("Escrow network mismatch.");
  const head = await reader.getBlockNumber();
  if (head < 1n) throw Error("Confirmed escrow state is unavailable.");
  const blockNumber = head - 1n,
    block = await reader.getBlock({ blockNumber });
  if (!block.hash) throw Error("Confirmed block is unavailable.");
  const [factoryCode, escrowCode] = await Promise.all([
    reader.getCode({ address: factory, blockNumber }),
    reader.getCode({ address: escrow, blockNumber }),
  ]);
  assertTradeRuntime(factoryCode, templates.factory);
  assertTradeRuntime(escrowCode, templates.escrow);
  const read = (
    address: Address,
    functionName: string,
    args?: readonly unknown[],
  ) => reader.readContract({ address, abi, functionName, args, blockNumber });
  const names = [
    "offerId",
    "termsHash",
    "buyer",
    "seller",
    "arbiter",
    "token",
    "amount",
    "fundBy",
    "dispatchWindow",
    "deliveryWindow",
    "inspectionWindow",
  ] as const;
  if (
    names.some((name) => binding.contractTerms[name] === undefined) ||
    binding.termsHash !== binding.contractTerms.termsHash
  )
    throw Error("Incomplete or inconsistent expected escrow terms.");
  const t = binding.contractTerms,
    key = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "bytes32" }],
        [t.seller, t.buyer, t.offerId],
      ),
    );
  const [registered, token, arbiter, values, state] = await Promise.all([
    read(factory, "escrows", [key]),
    read(factory, "token"),
    read(factory, "arbiter"),
    Promise.all(names.map((k) => read(escrow, k))),
    read(escrow, "state"),
  ]);
  const sameAddress = (a: unknown, b: string) =>
    typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  if (
    !sameAddress(registered, escrow) ||
    !sameAddress(token, t.token) ||
    !sameAddress(arbiter, t.arbiter)
  )
    throw Error("Escrow factory binding mismatch.");
  for (const [index, name] of names.entries()) {
    const expected = t[name as keyof typeof t],
      actual = values[index];
    const matches =
      typeof expected === "string"
        ? typeof actual === "string" &&
          actual.toLowerCase() === expected.toLowerCase()
        : (typeof actual === "bigint" || typeof actual === "number") &&
          BigInt(actual) === BigInt(expected);
    if (!matches) throw Error("Escrow term mismatch: " + name);
  }
  if (
    (typeof state !== "number" && typeof state !== "bigint") ||
    !Number.isInteger(Number(state)) ||
    Number(state) < 0 ||
    Number(state) > 9
  )
    throw Error("Invalid escrow lifecycle state.");
  const latestBlock = await reader.getBlock({ blockNumber: head });
  if (!latestBlock.hash || latestBlock.timestamp < block.timestamp)
    throw Error("Invalid chain head.");
  const headState = await reader.readContract({
    address: escrow,
    abi,
    functionName: "state",
    blockNumber: head,
  });
  if (
    (typeof headState !== "number" && typeof headState !== "bigint") ||
    !Number.isInteger(Number(headState)) ||
    Number(headState) < Number(state) ||
    Number(headState) > 9
  )
    throw Error("Invalid escrow head state.");
  const headCheck = await reader.getBlock({ blockNumber: head });
  const check = await reader.getBlock({ blockNumber });
  if (
    check.hash !== block.hash ||
    headCheck.hash !== latestBlock.hash ||
    (await reader.getChainId()) !== binding.chainId
  )
    throw Error("Escrow snapshot changed during verification.");
  const lifecycle = Number(state);
  if (
    lifecycle <= 1 &&
    Number(headState) <= 1 &&
    latestBlock.timestamp >= BigInt(t.fundBy)
  )
    throw Error("Escrow funding deadline has expired.");
  return {
    escrow,
    factory,
    chainId: binding.chainId,
    blockNumber,
    blockHash: block.hash,
    state: lifecycle,
    headState: Number(headState),
    codeMatched: true as const,
    fundingEnabled: false as const,
    disposition:
      Number(headState) !== lifecycle
        ? "state_confirmation_pending"
        : lifecycle === 0
          ? "seller_acceptance_required"
          : lifecycle === 1
            ? "unfunded"
            : lifecycle <= 5
              ? "already_funded"
              : "closed",
  };
}
