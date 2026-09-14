import { getAddress, keccak256, type Hex } from 'viem'
export class StockSettlementTargetError extends Error { constructor(readonly code: string) { super(code) } }
function check(value: unknown, code: string): asserts value { if (!value) throw new StockSettlementTargetError(code) }
function sameAddress(left: unknown, right: string) { try { return getAddress(String(left)) === getAddress(right) } catch { return false } }
export async function verifyStockSettlementTargets(input: {
  contract: string; runtimeHash: Hex; router: string; asset: string; underwritingSigner: string; riskSigner: string; protectionSigner: string
  repaymentSigner: string; treasury: string; code: Hex | undefined
  read: (target: 'delivery' | 'router', name: string, args?: readonly unknown[]) => Promise<unknown>; gasBalance: () => Promise<bigint>
}) {
  check(Boolean(input.code && input.code !== '0x' && keccak256(input.code) === input.runtimeHash), 'STOCK_DELIVERY_RUNTIME_MISMATCH')
  const deliveryDomain = await input.read('delivery', 'eip712Domain')
  check(Array.isArray(deliveryDomain) && deliveryDomain[0] === '0x0f' && deliveryDomain[1] === 'HashPayStream Stock Delivery' && deliveryDomain[2] === '1'
    && Number(deliveryDomain[3]) === 196 && sameAddress(deliveryDomain[4], input.contract), 'STOCK_DELIVERY_DOMAIN_MISMATCH')
  check(await input.read('delivery', 'paused') === false, 'STOCK_DELIVERY_PAUSED')
  check(sameAddress(await input.read('delivery', 'arcRepaymentRouter'), input.router), 'STOCK_DELIVERY_ROUTER_MISMATCH')
  const roles = [input.underwritingSigner, input.riskSigner, input.protectionSigner]
  check(new Set(roles.map(role => getAddress(role).toLowerCase())).size === roles.length, 'STOCK_DELIVERY_SIGNERS_NOT_SEPARATE')
  for (const [name, expected] of [['underwritingSigner', input.underwritingSigner], ['riskSigner', input.riskSigner], ['protectionSigner', input.protectionSigner]] as const) check(sameAddress(await input.read('delivery', name), expected), 'STOCK_DELIVERY_SIGNER_MISMATCH')
  check(await input.read('delivery', 'allowedStockAssets', [getAddress(input.asset)]) === true, 'STOCK_ASSET_NOT_ALLOWED')
  const routerDomain = await input.read('router', 'eip712Domain')
  check(Array.isArray(routerDomain) && routerDomain[0] === '0x0f' && routerDomain[1] === 'HashPayStream Upfront Repayment' && routerDomain[2] === '4'
    && Number(routerDomain[3]) === 5_042_002 && sameAddress(routerDomain[4], input.router), 'ARC_ROUTER_DOMAIN_MISMATCH')
  check(await input.read('router', 'paused') === false, 'ARC_ROUTER_PAUSED')
  check(sameAddress(await input.read('router', 'creditSigner'), input.repaymentSigner), 'ARC_ROUTER_SIGNER_MISMATCH')
  check(sameAddress(await input.read('router', 'platformTreasury'), input.treasury) && !/^0x0{40}$/i.test(input.treasury), 'ARC_ROUTER_TREASURY_MISMATCH')
  check(sameAddress(await input.read('router', 'asset'), '0x3600000000000000000000000000000000000000'), 'ARC_ROUTER_ASSET_MISMATCH')
  check(await input.gasBalance() > 0n, 'RELAYER_GAS_UNAVAILABLE')
}