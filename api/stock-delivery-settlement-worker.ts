import { readFile } from 'node:fs/promises'
import { createPublicClient, getAddress, http, isAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { SettlementCheckpoint, SettlementEvidence } from '../src/lib/settlementEvidence.js'
import { upfrontProtocol, type UpfrontEscrowVersion } from '../src/lib/upfrontProtocol.js'
import { mutateDurableJson, readDurableJson } from './durable-store.js'
import { verifyStockDeliveryReceipt } from './stock-delivery-opportunities.js'
import { recordVerifiedStockSettlement, safeStockDeliveryStore, saveStockSettlementCheckpoint, type StockDeliveryRequest, type StockDeliveryStore } from './stock-delivery-workflow.js'
import { recoverSettlementEvidence } from './upfront-settlement-evidence.js'
import { agreement, errorCode, isSettled, submit, type SettlementPassResult, type UpfrontSettlementWorkerConfig } from './upfront-settlement-worker.js'
import { signSplitSettlement, type AuthoritativeArcAgreement, type UpfrontPosition } from './upfront-protection-attestation.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const ZERO_HASH = `0x${'0'.repeat(64)}` as Hex
export type StockDeliverySettlementConfig = {
  enabled: boolean; storeKey: string; baseUrl: string; apiKey: string; xLayerRpcUrl: string; deliveryContract: Address; runtimeHash: Hex
  confirmations: number; arcRpcUrl: string; router: Address; repaymentKey: Hex; repaymentSigner: Address; escrowVersion: UpfrontEscrowVersion
}
export type StockDeliverySettlementDependencies = {
  env: () => NodeJS.ProcessEnv; now: () => Date
  readStore: (key: string) => Promise<StockDeliveryStore | undefined>
  saveCheckpoint: (key: string, deliveryId: Hex, checkpoint: SettlementCheckpoint, now: Date) => Promise<void>
  markSettled: (key: string, deliveryId: Hex, evidence: SettlementEvidence, now: Date) => Promise<void>
  recoveryStartBlock: (config: StockDeliverySettlementConfig) => Promise<bigint | undefined>
  blockNumber: (config: StockDeliverySettlementConfig) => Promise<bigint>
  recover: (checkpoint: SettlementCheckpoint, config: StockDeliverySettlementConfig) => Promise<{ evidence?: SettlementEvidence; checkpoint: SettlementCheckpoint }>
  verifyDelivery: (request: StockDeliveryRequest, config: StockDeliverySettlementConfig) => Promise<void>
  agreement: (id: string, config: StockDeliverySettlementConfig) => Promise<AuthoritativeArcAgreement>
  isSettled: (hash: Hex, config: StockDeliverySettlementConfig) => Promise<boolean>
  sign: typeof signSplitSettlement
  submit: (signed: Awaited<ReturnType<typeof signSplitSettlement>>, config: StockDeliverySettlementConfig) => Promise<SettlementEvidence | undefined>
}
function clean(value: unknown, max: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }
function address(value: unknown, code: string) { const text = clean(value, 42); if (!isAddress(text) || /^0x0{40}$/i.test(text)) throw Error(code); return getAddress(text) }
function url(value: unknown, code: string) { let parsed: URL; try { parsed = new URL(clean(value, 300)) } catch { throw Error(code) }; if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error(code); return parsed.toString() }
function key(value: unknown, code: string) { const text = clean(value, 66); if (!/^0x[a-fA-F0-9]{64}$/.test(text)) throw Error(code); return text as Hex }
export function stockDeliverySettlementConfiguration(env: NodeJS.ProcessEnv): StockDeliverySettlementConfig {
  const enabled = clean(env.HASHPAYSTREAM_STOCK_DELIVERY_SETTLEMENT_ENABLED, 10).toLowerCase() === 'true'
  if (!enabled) return { enabled, storeKey: '', baseUrl: '', apiKey: '', xLayerRpcUrl: '', deliveryContract: ZERO_ADDRESS, runtimeHash: ZERO_HASH, confirmations: 0, arcRpcUrl: '', router: ZERO_ADDRESS, repaymentKey: ZERO_HASH, repaymentSigner: ZERO_ADDRESS, escrowVersion: upfrontProtocol(env.HASHPAYSTREAM_UPFRONT_ESCROW_VERSION).escrowVersion }
  const repaymentKey = key(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY, 'REPAYMENT_KEY_INVALID')
  const repaymentSigner = address(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER, 'REPAYMENT_SIGNER_INVALID')
  if (privateKeyToAccount(repaymentKey).address !== repaymentSigner) throw Error('REPAYMENT_SIGNER_MISMATCH')
  const apiKey = clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 220), confirmations = Number(env.HASHPAYSTREAM_STOCK_DELIVERY_CONFIRMATIONS ?? 2)
  if (!apiKey.startsWith('hpl_test_') || apiKey.length < 32) throw Error('ARC_API_KEY_INVALID')
  if (Number(env.HASHPAYSTREAM_STOCK_DELIVERY_CHAIN_ID) !== 196 || !Number.isInteger(confirmations) || confirmations < 1 || confirmations > 64) throw Error('STOCK_DELIVERY_CONFIG_INVALID')
  return { enabled, storeKey: clean(env.HASHPAYSTREAM_STOCK_DELIVERY_STORE_KEY ?? 'hashpaystream:stock-deliveries:v1', 160),
    baseUrl: new URL(url(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 'HASH_PAYLINK_URL_INVALID')).origin,
    apiKey, xLayerRpcUrl: url(env.HASHPAYSTREAM_XLAYER_RPC_URL, 'XLAYER_RPC_INVALID'), deliveryContract: address(env.HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS, 'STOCK_DELIVERY_CONTRACT_INVALID'), runtimeHash: key(env.HASHPAYSTREAM_STOCK_DELIVERY_RUNTIME_HASH, 'STOCK_DELIVERY_RUNTIME_INVALID'), confirmations,
    arcRpcUrl: url(env.HASHPAYSTREAM_ARC_RPC_URL ?? 'https://rpc.testnet.arc.network', 'ARC_RPC_INVALID'), router: address(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 'ARC_ROUTER_INVALID'),
    repaymentKey, repaymentSigner, escrowVersion: upfrontProtocol(env.HASHPAYSTREAM_UPFRONT_ESCROW_VERSION).escrowVersion }
}
function upstreamConfig(config: StockDeliverySettlementConfig): UpfrontSettlementWorkerConfig {
  return { enabled: true, escrowVersion: config.escrowVersion, storeKey: config.storeKey, baseUrl: config.baseUrl, apiKey: config.apiKey,
    xLayerRpcUrl: config.xLayerRpcUrl, escrow: ZERO_ADDRESS, arcRpcUrl: config.arcRpcUrl, router: config.router, repaymentKey: config.repaymentKey, repaymentSigner: config.repaymentSigner }
}
function position(request: StockDeliveryRequest): UpfrontPosition {
  const authorization = request.authorization
  return { positionId: request.id, funder: authorization.terms.funder, repaymentRecipient: authorization.terms.repaymentRecipient,
    provider: authorization.offer.worker, providerArcRecipient: authorization.terms.workerArcRecipient, platformTreasury: authorization.terms.platformTreasury,
    termsHash: authorization.offer.agreementTermsHash, fundingTermsHash: authorization.protection.deliveryTermsHash,
    intelligenceCommitment: authorization.offer.intelligenceCommitment, protectedAmount: authorization.offer.protectedAmount,
    advanceAmount: authorization.terms.advanceUsdcAmount, funderRepaymentAmount: authorization.terms.funderRepaymentAmount,
    platformFeeAmount: authorization.terms.platformFeeAmount, protectionDeadline: authorization.offer.protectionDeadline, status: 'Released' }
}
function validateEvidence(request: StockDeliveryRequest, evidence: SettlementEvidence, config: StockDeliverySettlementConfig) {
  const terms = request.authorization.terms
  if (evidence.chainId !== 5_042_002 || getAddress(evidence.router) !== config.router || evidence.agreementHash.toLowerCase() !== request.authorization.protection.arcAgreementHash.toLowerCase()
    || evidence.funderAmount !== terms.funderRepaymentAmount || evidence.treasuryAmount !== terms.platformFeeAmount
    || BigInt(evidence.funderAmount) + BigInt(evidence.providerAmount) + BigInt(evidence.treasuryAmount) !== BigInt(request.authorization.offer.protectedAmount)) throw Error('STOCK_SETTLEMENT_EVIDENCE_MISMATCH')
}
const defaults: StockDeliverySettlementDependencies = {
  env: () => process.env, now: () => new Date(), readStore: key => readDurableJson(key),
  saveCheckpoint: async (key, deliveryId, checkpoint, now) => { await mutateDurableJson<StockDeliveryStore>(key, current => saveStockSettlementCheckpoint(current, { deliveryId, checkpoint, now })) },
  markSettled: async (key, deliveryId, evidence, now) => { await mutateDurableJson<StockDeliveryStore>(key, current => recordVerifiedStockSettlement(current, { deliveryId, evidence, now }).store) },
  recoveryStartBlock: async config => { const tracked = JSON.parse(await readFile(new URL('../contracts/deployments/arc-testnet.json', import.meta.url), 'utf8')); const block = tracked.repaymentRouter?.blockNumber; return tracked.chainId === 5_042_002 && String(tracked.repaymentRouter?.address).toLowerCase() === config.router.toLowerCase() && Number.isSafeInteger(block) && block >= 0 ? BigInt(block) : undefined },
  blockNumber: config => createPublicClient({ transport: http(config.arcRpcUrl) }).getBlockNumber(),
  recover: (checkpoint, config) => recoverSettlementEvidence(createPublicClient({ transport: http(config.arcRpcUrl) }), checkpoint),
  verifyDelivery: async (request, config) => { if (!request.delivery) throw Error('STOCK_DELIVERY_RECEIPT_MISSING'); const receipt = await verifyStockDeliveryReceipt(request.delivery.transactionHash, request.authorization, { chainId: 196, rpcUrl: config.xLayerRpcUrl, contract: config.deliveryContract, runtimeHash: config.runtimeHash, confirmations: config.confirmations }); if (receipt.blockHash !== request.delivery.blockHash || receipt.blockNumber !== request.delivery.blockNumber) throw Error('STOCK_DELIVERY_RECEIPT_CHANGED') },
  agreement: (id, config) => agreement(id, upstreamConfig(config)), isSettled: (hash, config) => isSettled(hash, upstreamConfig(config)),
  sign: signSplitSettlement, submit: (signed, config) => submit(signed, upstreamConfig(config)),
}
export async function runStockDeliverySettlementPass(overrides: Partial<StockDeliverySettlementDependencies> = {}): Promise<SettlementPassResult> {
  const dependencies = { ...defaults, ...overrides }; let config: StockDeliverySettlementConfig
  try { config = stockDeliverySettlementConfiguration(dependencies.env()) } catch (reason) { return { eligible: 0, settled: 0, alreadySettled: 0, deferred: 1, codes: [errorCode(reason)] } }
  if (!config.enabled) return { eligible: 0, settled: 0, alreadySettled: 0, deferred: 0, codes: [] }
  const result: SettlementPassResult = { eligible: 0, settled: 0, alreadySettled: 0, deferred: 0, codes: [] }
  try {
    const store = safeStockDeliveryStore(await dependencies.readStore(config.storeKey))
    for (const request of Object.values(store.requests)) {
      if (request.status !== 'delivered' || !request.delivery || request.settlement) continue
      result.eligible += 1
      try {
        await dependencies.verifyDelivery(request, config)
        let checkpoint = request.settlementCheckpoint
        if (checkpoint && (checkpoint.chainId !== 5_042_002 || checkpoint.router.toLowerCase() !== config.router.toLowerCase() || checkpoint.agreementHash.toLowerCase() !== request.authorization.protection.arcAgreementHash.toLowerCase())) throw Error('SETTLEMENT_EVIDENCE_TARGET_MISMATCH')
        const recover = async () => {
          if (!checkpoint) { const start = await dependencies.recoveryStartBlock(config); if (start === undefined) throw Error('SETTLEMENT_EVIDENCE_CHECKPOINT_MISSING'); checkpoint = { chainId: 5_042_002, router: config.router, agreementHash: request.authorization.protection.arcAgreementHash, nextBlock: start.toString() }; await dependencies.saveCheckpoint(config.storeKey, request.id, checkpoint, dependencies.now()) }
          const found = await dependencies.recover(checkpoint, config); checkpoint = found.checkpoint
          if (!found.evidence) { await dependencies.saveCheckpoint(config.storeKey, request.id, checkpoint, dependencies.now()); throw Error('SETTLEMENT_EVIDENCE_PENDING') }
          validateEvidence(request, found.evidence, config); await dependencies.markSettled(config.storeKey, request.id, found.evidence, dependencies.now())
        }
        const submissionStartBlock = checkpoint ? undefined : await dependencies.blockNumber(config)
        if (await dependencies.isSettled(request.authorization.protection.arcAgreementHash, config)) { await recover(); result.alreadySettled += 1; continue }
        const authoritative = await dependencies.agreement(request.agreementId, config)
        const signed = await dependencies.sign({ request: request.agreementRequest, position: position(request), agreement: authoritative, arcRouter: config.router, escrowVersion: config.escrowVersion, privateKey: config.repaymentKey, now: dependencies.now() })
        if (!checkpoint) { checkpoint = { chainId: 5_042_002, router: config.router, agreementHash: request.authorization.protection.arcAgreementHash, nextBlock: (submissionStartBlock! > 2n ? submissionStartBlock! - 2n : 0n).toString() }; await dependencies.saveCheckpoint(config.storeKey, request.id, checkpoint, dependencies.now()) }
        const evidence = await dependencies.submit(signed, config)
        if (evidence) { validateEvidence(request, evidence, config); await dependencies.markSettled(config.storeKey, request.id, evidence, dependencies.now()) } else await recover()
        result.settled += 1
      } catch (reason) { result.deferred += 1; result.codes.push(errorCode(reason)) }
    }
  } catch (reason) { result.deferred += 1; result.codes.push(errorCode(reason)) }
  result.codes = [...new Set(result.codes)].sort(); return result
}