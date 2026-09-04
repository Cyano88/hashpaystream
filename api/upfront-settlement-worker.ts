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
  markSettled: (key: string, recordKey: string) => Promise<void>
  agreement: (id: string, config: UpfrontSettlementWorkerConfig) => Promise<AuthoritativeArcAgreement>
  position: (id: Hex, config: UpfrontSettlementWorkerConfig) => Promise<WorkerPosition>
  isSettled: (agreementHash: Hex, config: UpfrontSettlementWorkerConfig) => Promise<boolean>
  sign: typeof signSplitSettlement
  submit: (signed: SignedSettlement, config: UpfrontSettlementWorkerConfig) => Promise<void>
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
    enabled,
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
  const response = await fetch(`${config.baseUrl}/api/v2/agreements?id=${encodeURIComponent(id)}`, { cache: 'no-store', headers: { 'x-api-key': config.apiKey, accept: 'application/json' } })
  const body = await response.json().catch(() => ({})) as { agreement?: AuthoritativeArcAgreement }
  if (!response.ok || !body.agreement) throw new Error('AGREEMENT_UNAVAILABLE')
  return body.agreement
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
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('SETTLEMENT_REVERTED')
  } catch (reason) {
    if (await isSettled(message.arcAgreementHash, config).catch(() => false)) return
    throw reason
  }
}

const defaults: UpfrontSettlementWorkerDependencies = {
  env: () => process.env,
  now: () => new Date(),
  readStore: key => readDurableJson<UpfrontAssessmentStore>(key),
  markSettled: async (key, recordKey) => {
    await mutateDurableJson<UpfrontAssessmentStore>(key, current => {
      const record = current?.records?.[recordKey]
      if (!record?.fundingRequest) return current ?? { schema: 1, records: {} }
      return { ...current!, records: { ...current!.records, [recordKey]: { ...record, fundingRequest: { ...record.fundingRequest, status: 'settled' } } } }
    })
  },
  agreement,
  position,
  isSettled,
  sign: signSplitSettlement,
  submit,
  log: event => console.log(JSON.stringify(event)),
}

function errorCode(reason: unknown) {
  const code = reason instanceof Error ? reason.message : 'SETTLEMENT_UNAVAILABLE'
  return /^[A-Z0-9_]{3,80}$/.test(code) ? code : 'SETTLEMENT_DEFERRED'
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
      if (record.status !== 'completed' || !record.request || !record.agreementId || !funding || funding.status !== 'pending') continue
      const positionId = funding.fundingTerms?.message?.offerHash
      if (!/^0x[a-fA-F0-9]{64}$/.test(String(positionId ?? ''))) continue
      try {
        const current = await dependencies.position(positionId as Hex, config)
        if (current.status !== 'Released' || current.arcAgreementHash === ZERO_HASH) continue
        result.eligible += 1
        if (await dependencies.isSettled(current.arcAgreementHash, config)) { await dependencies.markSettled(config.storeKey, recordKey); result.alreadySettled += 1; continue }
        const authoritative = await dependencies.agreement(record.agreementId, config)
        if (!authoritative.chain || authoritative.chain.onchainAgreementId.toLowerCase() !== current.arcAgreementHash.toLowerCase()) throw new Error('ARC_AGREEMENT_MISMATCH')
        const signed = await dependencies.sign({ request: record.request, position: current, agreement: authoritative, arcRouter: config.router, privateKey: config.repaymentKey, now: dependencies.now() })
        await dependencies.submit(signed, config)
        await dependencies.markSettled(config.storeKey, recordKey)
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
