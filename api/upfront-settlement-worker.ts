import { readFile } from 'node:fs/promises'
import type { SettlementCheckpoint, SettlementEvidence } from '../src/lib/settlementEvidence.js'
import { recoverSettlementEvidence, verifySettlementReceipt } from './upfront-settlement-evidence.js'
import { upfrontProtocol, type UpfrontEscrowVersion } from '../src/lib/upfrontProtocol.js'
import { createPublicClient, createWalletClient, defineChain, getAddress, http, isAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mutateDurableJson, readDurableJson } from './durable-store.js'
import type { UpfrontAssessmentStore } from './upfront-assessment.js'
import { signSplitSettlement, type AuthoritativeArcAgreement, type UpfrontPosition } from './upfront-protection-attestation.js'

const ZERO_HASH = `0x${'0'.repeat(64)}`
const POSITION_ABI = [{ type: 'function', name: 'positions', stateMutability: 'view', inputs: [{ name: 'positionId', type: 'bytes32' }], outputs: [
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' }, { name: 'provider', type: 'address' },
  { name: 'providerArcRecipient', type: 'address' }, { name: 'platformTreasury', type: 'address' }, { name: 'protectionSigner', type: 'address' },
  { name: 'termsHash', type: 'bytes32' }, { name: 'fundingTermsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' },
  { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' }, { name: 'advanceAmount', type: 'uint256' },
  { name: 'funderRepaymentAmount', type: 'uint256' }, { name: 'platformFeeAmount', type: 'uint256' }, { name: 'protectionDeadline', type: 'uint48' }, { name: 'status', type: 'uint8' },
] }] as const
const ROUTER_ABI = [
  { type: 'function', name: 'settledAgreements', stateMutability: 'view', inputs: [{ name: 'arcAgreementHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'settleRepayment', stateMutability: 'nonpayable', inputs: [
    { name: 'settlement', type: 'tuple', components: [
      { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'arcTermsHash', type: 'bytes32' }, { name: 'funder', type: 'address' },
      { name: 'provider', type: 'address' }, { name: 'treasury', type: 'address' }, { name: 'funderAmount', type: 'uint256' },
      { name: 'providerAmount', type: 'uint256' }, { name: 'treasuryAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' },
      { name: 'deadline', type: 'uint48' },
    ] },
    { name: 'signature', type: 'bytes' },
  ], outputs: [] },
] as const

const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  testnet: true,
})

export type UpfrontSettlementWorkerConfig = {
  enabled: boolean
  escrowVersion?: UpfrontEscrowVersion
  storeKey: string
  baseUrl: string
  apiKey: string
  xLayerRpcUrl: string
  escrow: Address
  arcRpcUrl: string
  router: Address
  repaymentKey: Hex
  repaymentSigner: Address
}

type SignedSettlement = Awaited<ReturnType<typeof signSplitSettlement>>
type WorkerPosition = UpfrontPosition & { arcAgreementHash: Hex }
export type SettlementPassResult = { eligible: number; settled: number; alreadySettled: number; deferred: number; codes: string[] }
export type UpfrontSettlementWorkerDependencies = {
  env: () => NodeJS.ProcessEnv
  now: () => Date
  readStore: (key: string) => Promise<UpfrontAssessmentStore | undefined>
  markSettled: (key: string, recordKey: string, evidence: SettlementEvidence) => Promise<void>
  saveCheckpoint: (key: string, recordKey: string, checkpoint: SettlementCheckpoint) => Promise<void>
  recoveryStartBlock: (config: UpfrontSettlementWorkerConfig) => Promise<bigint | undefined>
  blockNumber: (config: UpfrontSettlementWorkerConfig) => Promise<bigint>
  recover: (checkpoint: SettlementCheckpoint, config: UpfrontSettlementWorkerConfig) => Promise<{ evidence?: SettlementEvidence; checkpoint: SettlementCheckpoint }>
  agreement: (id: string, config: UpfrontSettlementWorkerConfig) => Promise<AuthoritativeArcAgreement>
  position: (id: Hex, config: UpfrontSettlementWorkerConfig) => Promise<WorkerPosition>
  isSettled: (agreementHash: Hex, config: UpfrontSettlementWorkerConfig) => Promise<boolean>
  sign: typeof signSplitSettlement
  submit: (signed: SignedSettlement, config: UpfrontSettlementWorkerConfig) => Promise<SettlementEvidence | undefined>
  log: (event: Record<string, unknown>) => void
}

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function address(value: unknown, label: string) { const text = clean(value, 42); if (!isAddress(text) || /^0x0{40}$/i.test(text)) throw new Error(label); return getAddress(text) }
function privateKey(value: unknown, label: string) { const text = clean(value, 66); if (!/^0x[a-fA-F0-9]{64}$/.test(text)) throw new Error(label); return text as Hex }
function url(value: unknown, label: string) { let parsed: URL; try { parsed = new URL(clean(value, 300)) } catch { throw new Error(label) }; if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(label); return parsed.toString() }

export function upfrontSettlementWorkerConfiguration(env: NodeJS.ProcessEnv): UpfrontSettlementWorkerConfig {
  const enabled = clean(env.HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED, 10).toLowerCase() === 'true'
  if (!enabled) return { enabled, storeKey: '', baseUrl: '', apiKey: '', xLayerRpcUrl: '', escrow: '0x0000000000000000000000000000000000000000', arcRpcUrl: '', router: '0x0000000000000000000000000000000000000000', repaymentKey: ZERO_HASH as Hex, repaymentSigner: '0x0000000000000000000000000000000000000000' }
  const repaymentKey = privateKey(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY, 'REPAYMENT_KEY_INVALID')
  const repaymentSigner = address(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER, 'REPAYMENT_SIGNER_INVALID')
  if (privateKeyToAccount(repaymentKey).address !== repaymentSigner) throw new Error('REPAYMENT_SIGNER_MISMATCH')
  const apiKey = clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 220)
  if (!apiKey.startsWith('hpl_test_') || apiKey.length < 32) throw new Error('ARC_API_KEY_INVALID')
  return {
    enabled, escrowVersion: upfrontProtocol(env.HASHPAYSTREAM_UPFRONT_ESCROW_VERSION).escrowVersion,
    storeKey: clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? 'hashpaystream:upfront-assessments:v1', 160),
    baseUrl: new URL(url(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 'HASH_PAYLINK_URL_INVALID')).origin,
    apiKey,
    xLayerRpcUrl: url(env.HASHPAYSTREAM_XLAYER_RPC_URL, 'XLAYER_RPC_INVALID'),
    escrow: address(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 'ESCROW_INVALID'),
    arcRpcUrl: url(env.HASHPAYSTREAM_ARC_RPC_URL ?? 'https://rpc.testnet.arc.network', 'ARC_RPC_INVALID'),
    router: address(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 'ARC_ROUTER_INVALID'),
    repaymentKey,
    repaymentSigner,
  }
}

async function agreement(id: string, config: UpfrontSettlementWorkerConfig) {
  try {
    const response = await fetch(`${config.baseUrl}/api/v2/agreements?id=${encodeURIComponent(id)}`, {
      cache: 'no-store', headers: { 'x-api-key': config.apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const body = await response.json() as { agreement?: AuthoritativeArcAgreement }
    if (!response.ok || !body.agreement) throw new Error('AGREEMENT_UNAVAILABLE')
    return body.agreement
  } catch (reason) {
    if (reason instanceof Error && ['TimeoutError', 'AbortError'].includes(reason.name)) throw new Error('AGREEMENT_TIMEOUT')
    throw new Error('AGREEMENT_UNAVAILABLE')
  }
}
async function position(id: Hex, config: UpfrontSettlementWorkerConfig): Promise<WorkerPosition> {
  const value = await createPublicClient({ transport: http(config.xLayerRpcUrl) }).readContract({ address: config.escrow, abi: POSITION_ABI, functionName: 'positions', args: [id] })
  const status = value[15] === 1 ? 'Funded' : value[15] === 2 ? 'Released' : value[15] === 3 ? 'Refunded' : undefined
  if (!status) throw new Error('POSITION_UNAVAILABLE')
  return { positionId: id, funder: value[0], repaymentRecipient: value[1], provider: value[2], providerArcRecipient: value[3], platformTreasury: value[4], termsHash: value[6], fundingTermsHash: value[7], intelligenceCommitment: value[8], arcAgreementHash: value[9], protectedAmount: value[10].toString(), advanceAmount: value[11].toString(), funderRepaymentAmount: value[12].toString(), platformFeeAmount: value[13].toString(), protectionDeadline: Number(value[14]), status }
}

async function isSettled(agreementHash: Hex, config: UpfrontSettlementWorkerConfig) {
  return createPublicClient({ chain: arcTestnet, transport: http(config.arcRpcUrl) }).readContract({ address: config.router, abi: ROUTER_ABI, functionName: 'settledAgreements', args: [agreementHash] })
}

async function submit(signed: SignedSettlement, config: UpfrontSettlementWorkerConfig) {
  const account = privateKeyToAccount(config.repaymentKey)
  const client = createPublicClient({ chain: arcTestnet, transport: http(config.arcRpcUrl) })
  const raw = signed.message
  const message = { ...raw, funderAmount: BigInt(raw.funderAmount), providerAmount: BigInt(raw.providerAmount), treasuryAmount: BigInt(raw.treasuryAmount) }
  if (await isSettled(message.arcAgreementHash, config)) return
  try {
    const [gasBalance, gasPrice] = await Promise.all([
      client.getBalance({ address: account.address }),
      client.getGasPrice(),
    ])
    if (gasBalance === 0n) throw new Error('RELAYER_GAS_UNAVAILABLE')
    const gas = await client.estimateContractGas({ account, address: config.router, abi: ROUTER_ABI, functionName: 'settleRepayment', args: [message, signed.signature] })
    if (gasBalance < gas * gasPrice * 2n) throw new Error('RELAYER_GAS_UNAVAILABLE')
    const simulation = await client.simulateContract({ account, address: config.router, abi: ROUTER_ABI, functionName: 'settleRepayment', args: [message, signed.signature] })
    const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(config.arcRpcUrl) })
    const hash = await wallet.writeContract(simulation.request)
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 60_000 })
    if (receipt.status !== 'success') throw new Error('SETTLEMENT_REVERTED')
    return await verifySettlementReceipt(client, config.router, message.arcAgreementHash, hash)
  } catch (reason) {
    if (await isSettled(message.arcAgreementHash, config).catch(() => false)) return
    throw reason
  }
}

const defaults: UpfrontSettlementWorkerDependencies = {
  env: () => process.env,
  now: () => new Date(),
  readStore: key => readDurableJson<UpfrontAssessmentStore>(key),
  markSettled: async (key, recordKey, evidence) => {
    await mutateDurableJson<UpfrontAssessmentStore>(key, current => {
      const record = current?.records?.[recordKey]
      if (!record?.fundingRequest || record.fundingRequest.status === 'declined') throw Error('SETTLEMENT_RECORD_CHANGED')
      const checkpoint = record.fundingRequest.settlementCheckpoint
      if (!checkpoint || checkpoint.chainId !== evidence.chainId || checkpoint.router.toLowerCase() !== evidence.router.toLowerCase() || checkpoint.agreementHash.toLowerCase() !== evidence.agreementHash.toLowerCase()) throw Error('SETTLEMENT_EVIDENCE_TARGET_MISMATCH')
      const prior = record.fundingRequest.settlementEvidence
      if (prior && (prior.transactionHash !== evidence.transactionHash || prior.chainId !== evidence.chainId || prior.router !== evidence.router)) throw Error('SETTLEMENT_EVIDENCE_CONFLICT')
      return { ...current!, records: { ...current!.records, [recordKey]: { ...record, fundingRequest: { ...record.fundingRequest, status: 'settled', settlementEvidence: evidence } } } }
    })
  },
  saveCheckpoint: async (key, recordKey, checkpoint) => {
    await mutateDurableJson<UpfrontAssessmentStore>(key, current => {
      const record = current?.records?.[recordKey]
      if (!record?.fundingRequest || record.fundingRequest.status === 'declined') throw Error('SETTLEMENT_RECORD_CHANGED')
      return { ...current!, records: { ...current!.records, [recordKey]: { ...record, fundingRequest: { ...record.fundingRequest, settlementCheckpoint: checkpoint } } } }
    })
  },
  recoveryStartBlock: async config => {
    const tracked = JSON.parse(await readFile(new URL('../contracts/deployments/arc-testnet.json', import.meta.url), 'utf8'))
    if (tracked.chainId !== 5042002 || String(tracked.repaymentRouter?.address).toLowerCase() !== config.router.toLowerCase()) return undefined
    const block = tracked.repaymentRouter?.blockNumber
    return Number.isSafeInteger(block) && block >= 0 ? BigInt(block) : undefined
  },
  blockNumber: config => createPublicClient({ transport: http(config.arcRpcUrl) }).getBlockNumber(),
  recover: (checkpoint, config) => recoverSettlementEvidence(createPublicClient({ transport: http(config.arcRpcUrl) }), checkpoint),
  agreement,
  position,
  isSettled,
  sign: signSplitSettlement,
  submit,
  log: event => console.log(JSON.stringify(event)),
}

function errorCode(reason: unknown) {
  const code = reason instanceof Error ? reason.message : 'SETTLEMENT_UNAVAILABLE'
  if (/^[A-Z0-9_]{3,80}$/.test(code)) return code
  // Fixed classifications only; never expose RPC messages or signed calldata.
  const classifications: Record<string, string> = {
    InsufficientFundsError: 'RELAYER_GAS_UNAVAILABLE',
    NonceTooLowError: 'SETTLEMENT_NONCE_TOO_LOW',
    NonceTooHighError: 'SETTLEMENT_NONCE_TOO_HIGH',
    TransactionUnderpricedError: 'SETTLEMENT_UNDERPRICED',
    FeeCapTooLowError: 'SETTLEMENT_FEE_CAP_TOO_LOW',
    EstimateGasExecutionError: 'SETTLEMENT_GAS_ESTIMATE_FAILED',
    ContractFunctionRevertedError: 'SETTLEMENT_CONTRACT_REVERTED',
    HttpRequestError: 'SETTLEMENT_RPC_HTTP_ERROR',
    TimeoutError: 'SETTLEMENT_RPC_TIMEOUT',
    TransactionExecutionError: 'SETTLEMENT_TRANSACTION_FAILED',
    RpcRequestError: 'SETTLEMENT_RPC_REJECTED',
  }
  let classified = 'SETTLEMENT_DEFERRED'
  let cause: unknown = reason
  for (let depth = 0; depth < 8 && cause instanceof Error; depth += 1) {
    classified = classifications[cause.name] ?? classified
    cause = cause.cause
  }
  return classified
}

export async function runUpfrontSettlementPass(overrides: Partial<UpfrontSettlementWorkerDependencies> = {}): Promise<SettlementPassResult> {
  const dependencies = { ...defaults, ...overrides }
  let config: UpfrontSettlementWorkerConfig
  try { config = upfrontSettlementWorkerConfiguration(dependencies.env()) } catch (reason) { return { eligible: 0, settled: 0, alreadySettled: 0, deferred: 1, codes: [errorCode(reason)] } }
  if (!config.enabled) return { eligible: 0, settled: 0, alreadySettled: 0, deferred: 0, codes: [] }
  const result: SettlementPassResult = { eligible: 0, settled: 0, alreadySettled: 0, deferred: 0, codes: [] }
  try {
    const store = await dependencies.readStore(config.storeKey)
    for (const [recordKey, record] of Object.entries(store?.records ?? {})) {
      const funding = record.fundingRequest
      if (record.status !== 'completed' || !record.request || !record.agreementId || !funding || (funding.status !== 'pending' && !(funding.status === 'settled' && !funding.settlementEvidence))) continue
      const positionId = funding.fundingTerms?.message?.offerHash
      if (!/^0x[a-fA-F0-9]{64}$/.test(String(positionId ?? ''))) continue
      try {
        const current = await dependencies.position(positionId as Hex, config)
        if (current.status !== 'Released' || current.arcAgreementHash === ZERO_HASH) continue
        result.eligible += 1
        let checkpoint = funding.settlementCheckpoint
        if (checkpoint && (checkpoint.chainId !== 5042002 || checkpoint.router.toLowerCase() !== config.router.toLowerCase() || checkpoint.agreementHash.toLowerCase() !== current.arcAgreementHash.toLowerCase())) throw Error('SETTLEMENT_EVIDENCE_TARGET_MISMATCH')
        const recover = async () => {
          if (!checkpoint) {
            const start = await dependencies.recoveryStartBlock(config)
            if (start === undefined) throw Error('SETTLEMENT_EVIDENCE_CHECKPOINT_MISSING')
            checkpoint = { chainId: 5042002, router: config.router, agreementHash: current.arcAgreementHash, nextBlock: start.toString() }
            await dependencies.saveCheckpoint(config.storeKey, recordKey, checkpoint)
          }
          const found = await dependencies.recover(checkpoint, config)
          if (!found.evidence) {
            await dependencies.saveCheckpoint(config.storeKey, recordKey, found.checkpoint)
            throw Error('SETTLEMENT_EVIDENCE_PENDING')
          }
          await dependencies.markSettled(config.storeKey, recordKey, found.evidence)
        }
        // Capture the search start before checking state: another relayer may settle
        // during provider/signature work, before our own submission check.
        const submissionStartBlock = checkpoint ? undefined : await dependencies.blockNumber(config)
        if (await dependencies.isSettled(current.arcAgreementHash, config)) { await recover(); result.alreadySettled += 1; continue }
        if (funding.status === 'settled') throw Error('SETTLEMENT_CHAIN_STATE_MISMATCH')
        const authoritative = await dependencies.agreement(record.agreementId, config)
        if (!authoritative.chain || authoritative.chain.onchainAgreementId.toLowerCase() !== current.arcAgreementHash.toLowerCase()) throw new Error('ARC_AGREEMENT_MISMATCH')
        const signed = await dependencies.sign({ request: record.request, position: current, agreement: authoritative, arcRouter: config.router, escrowVersion: config.escrowVersion, privateKey: config.repaymentKey, now: dependencies.now() })
        if (!checkpoint) {
          checkpoint = { chainId: 5042002, router: config.router, agreementHash: current.arcAgreementHash, nextBlock: (submissionStartBlock! > 2n ? submissionStartBlock! - 2n : 0n).toString() }
          await dependencies.saveCheckpoint(config.storeKey, recordKey, checkpoint)
        }
        const evidence = await dependencies.submit(signed, config)
        if (evidence) await dependencies.markSettled(config.storeKey, recordKey, evidence)
        else await recover()
        result.settled += 1
      } catch (reason) {
        result.deferred += 1
        result.codes.push(errorCode(reason))
      }
    }
  } catch (reason) {
    result.deferred += 1
    result.codes.push(errorCode(reason))
  }
  result.codes = [...new Set(result.codes)].sort()
  return result
}

export function startUpfrontSettlementWorker(overrides: Partial<UpfrontSettlementWorkerDependencies> = {}, intervalMs = 30_000) {
  const dependencies = { ...defaults, ...overrides }
  let running = false
  let stopped = false
  let rerun = false
  let lastReport = ''
  const tick = async () => {
    if (stopped) return
    if (running) { rerun = true; return }
    running = true
    try {
      do {
        rerun = false
        const result = await runUpfrontSettlementPass(dependencies)
        const report = JSON.stringify({ settled: result.settled, deferred: result.deferred, codes: result.codes })
        if (result.settled > 0 || (result.deferred > 0 && report !== lastReport)) {
          try { dependencies.log({ component: 'hashpaystream-upfront-settlement', event: result.settled > 0 ? 'settlement_completed' : 'settlement_deferred', ...result }) } catch {}
        }
        lastReport = report
      } while (rerun && !stopped)
    } finally { running = false }
  }
  const timer = setInterval(() => void tick(), Math.max(10_000, intervalMs))
  timer.unref?.()
  void tick()
  return {
    trigger: () => { void tick() },
    stop: () => { stopped = true; clearInterval(timer) },
  }
}
