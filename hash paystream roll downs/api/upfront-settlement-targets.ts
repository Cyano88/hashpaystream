import { getAddress } from 'viem'
export class SettlementTargetError extends Error {
  constructor(readonly code: string) { super(code) }
}
function check(condition: unknown, code: string): asserts condition { if (!condition) throw new SettlementTargetError(code) }
function sameAddress(actual: unknown, expected: string) {
  try { return getAddress(String(actual)) === getAddress(expected) } catch { return false }
}
export async function verifySettlementTargets(input: {
  escrowVersion: string; escrow: string; router: string; signer: string; treasury: string
  read: (target: 'escrow' | 'router', name: string) => Promise<unknown>
  gasBalance: () => Promise<bigint>
}) {
  check(input.escrowVersion === '2', 'REVIEWED_ESCROW_REQUIRED')
  for (const [target, name, version, chainId, address] of [
    ['escrow', 'HashPayStream Upfront', '2', 196, input.escrow],
    ['router', 'HashPayStream Upfront Repayment', '4', 5042002, input.router],
  ] as const) {
    const domain = await input.read(target, 'eip712Domain')
    check(Array.isArray(domain) && domain[0] === '0x0f' && domain[1] === name && domain[2] === version
      && Number(domain[3]) === chainId && sameAddress(domain[4], address), 'CONTRACT_DOMAIN_MISMATCH')
    check(await input.read(target, 'paused') === false, target === 'escrow' ? 'ESCROW_PAUSED' : 'ROUTER_PAUSED')
  }
  check(sameAddress(await input.read('escrow', 'arcRepaymentRouter'), input.router), 'ESCROW_ROUTER_MISMATCH')
  check(sameAddress(await input.read('router', 'creditSigner'), input.signer), 'ROUTER_SIGNER_MISMATCH')
  check(sameAddress(await input.read('router', 'platformTreasury'), input.treasury)
    && !/^0x0{40}$/i.test(input.treasury), 'ROUTER_TREASURY_MISMATCH')
  check(sameAddress(await input.read('escrow', 'asset'), '0xB6CEceAB302E2E4948951eE7843FC24E92933061'), 'ESCROW_ASSET_MISMATCH')
  check(sameAddress(await input.read('router', 'asset'), '0x3600000000000000000000000000000000000000'), 'ROUTER_ASSET_MISMATCH')
  check(await input.gasBalance() > 0n, 'RELAYER_GAS_UNAVAILABLE')
}
