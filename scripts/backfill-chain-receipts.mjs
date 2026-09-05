import { firstMatchingBlock, loadTransactionReceipt } from './chain-receipt-rpc.mjs'
import pg from 'pg'
import { createPublicClient, decodeEventLog, fallback, getAddress, http, isAddress, parseAbi } from 'viem'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'
import { ARC_AGREEMENT_EVENTS, UPFRONT_EVENTS, REPAYMENT_EVENTS, verifyConfirmedReceipt } from '../api/chain-receipt-evidence.ts'
import { indexVerifiedChainReceipt } from '../api/chain-receipt-index.ts'

const { Pool } = pg
const ARC_CHAIN_ID = 5_042_002
const XLAYER_CHAIN_ID = 196
const XLAYER_DEPLOYMENT_BLOCK = 69_253_749n
const ROUTER_DEPLOYMENT_BLOCK = 59_469_052n
const XLAYER_USDC = getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061')
const ARC_USDC = getAddress('0x3600000000000000000000000000000000000000')
const ARC_ESCROW_ABI = parseAbi([
  'function agreementId() view returns (bytes32)', 'function termsHash() view returns (bytes32)',
  'function payer() view returns (address)', 'function recipient() view returns (address)',
  'function usdc() view returns (address)', 'function totalAmount() view returns (uint256)',
  'function releaseSchedule() view returns (uint16[])',
])
const POSITION_ABI = parseAbi(['function positions(bytes32) view returns (address,address,address,address,address,address,bytes32,bytes32,bytes32,bytes32,uint256,uint256,uint256,uint256,uint48,uint8)'])
const ASSET_ABI = parseAbi(['function asset() view returns (address)'])
const BALANCE_ABI = parseAbi(['function balanceOf(address) view returns (uint256)'])
const ROUTER_ABI = parseAbi(['function settledAgreements(bytes32) view returns (bool)'])

function clean(value, maximum = 300) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function units(value, error = 'AMOUNT_INVALID') { const text = clean(value, 80); if (!/^\d{1,78}$/.test(text)) throw new Error(error); return BigInt(text) }
function hex32(value, error = 'HASH_INVALID') { const text = clean(value, 66); if (!/^0x[a-f0-9]{64}$/i.test(text)) throw new Error(error); return text.toLowerCase() }
function address(value, error = 'ADDRESS_INVALID') { const text = clean(value, 42); if (!isAddress(text)) throw new Error(error); return getAddress(text) }
function errorCode(reason) {
  if (reason instanceof Error && /^[A-Z0-9_]{3,80}$/.test(reason.message)) return reason.message
  const named = clean(reason?.name, 80).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  return named && named !== 'ERROR' ? named : 'CHAIN_RECEIPT_RECOVERY_FAILED'
}
function secureUrl(value, fallback, error) { let parsed; try { parsed = new URL(clean(value || fallback, 500)) } catch { throw new Error(error) }; if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(error); return parsed.toString() }
function rpcUrls(value, defaults, error) {
  const supplied = clean(value, 2_000).split(',').map(item => item.trim()).filter(Boolean)
  return [...new Set((supplied.length ? supplied : defaults).map(item => secureUrl(item, '', error)))]
}
function database(value, error) { let parsed; try { parsed = new URL(clean(value, 2_000)) } catch { throw new Error(error) }; if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.pathname.replace(/^\//, '')) throw new Error(error); return { value: clean(value, 2_000), parsed } }

function configuration() {
  const write = process.argv.includes('--confirm-staging-chain-index')
  if (write === process.argv.includes('--confirm-read-only-chain-audit')) throw new Error('EXACTLY_ONE_EXECUTION_MODE_REQUIRED')
  const source = database(process.env.HASHPAYSTREAM_LEGACY_DATABASE_URL, 'SOURCE_DATABASE_URL_INVALID')
  const authoritative = database(process.env.HASHPAYSTREAM_HASH_PAYLINK_DATABASE_URL, 'AUTHORITATIVE_DATABASE_URL_INVALID')
  let target
  if (write) {
    target = database(process.env.DATABASE_URL, 'TARGET_DATABASE_URL_INVALID')
    if (source.value === target.value || authoritative.value === target.value) throw new Error('SOURCE_TARGET_DATABASE_MUST_DIFFER')
    if (clean(process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT, 20).toLowerCase() !== 'staging') throw new Error('STAGING_DATABASE_ATTESTATION_REQUIRED')
    const local = ['localhost', '127.0.0.1', '::1'].includes(target.parsed.hostname.toLowerCase())
    const name = target.parsed.pathname.replace(/^\//, '').toLowerCase()
    if (!local && !process.argv.includes('--allow-remote-staging-database')) throw new Error('REMOTE_STAGING_DATABASE_NOT_ALLOWED')
    if (!local && !/(?:^|[_-])stag(?:ing)?(?:$|[_-])/.test(name)) throw new Error('STAGING_DATABASE_NAME_REQUIRED')
  }
  const stores = [
    { key: clean(process.env.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY || 'hashpaystream:arc-webhooks:v1', 160) },
    { key: clean(process.env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY || 'hashpaystream:upfront-arc-webhooks:v1', 160) },
    { key: clean(process.env.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY || 'hashpaystream:agent-arc-webhooks:v1', 160) },
  ]
  if (new Set(stores.map(item => item.key)).size !== stores.length) throw new Error('EVENT_STORE_DOMAINS_NOT_DISTINCT')
  const confirmations = Number(process.env.HASHPAYSTREAM_RECEIPT_MIN_CONFIRMATIONS || 12)
  if (!Number.isInteger(confirmations) || confirmations < 2 || confirmations > 10_000) throw new Error('CONFIRMATION_POLICY_INVALID')
  if (Number(process.env.HASHPAYSTREAM_UPFRONT_CHAIN_ID) !== XLAYER_CHAIN_ID) throw new Error('XLAYER_CHAIN_ID_INVALID')
  return { write, source: source.value, authoritative: authoritative.value, target: target?.value, stores, confirmations,
    assessmentStore: clean(process.env.HASHPAYSTREAM_UPFRONT_STORE_KEY || 'hashpaystream:upfront-assessments:v1', 160),
    arcRpcs: rpcUrls(process.env.HASHPAYSTREAM_ARC_RECEIPT_RPC_URLS, ['https://rpc.testnet.arc.network', 'https://rpc.blockdaemon.testnet.arc.network', 'https://rpc.drpc.testnet.arc.network', 'https://rpc.quicknode.testnet.arc.network'], 'ARC_RPC_URL_INVALID'),
    xLayerRpcs: rpcUrls(process.env.HASHPAYSTREAM_XLAYER_RECEIPT_RPC_URLS || process.env.HASHPAYSTREAM_XLAYER_RPC_URL, ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'], 'XLAYER_RPC_URL_INVALID'),
    xLayerEscrow: address(process.env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 'XLAYER_ESCROW_INVALID'),
    arcRouter: address(process.env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 'ARC_ROUTER_INVALID') }
}

async function loadStores(databaseUrl, keys) {
  const pool = new Pool({ ...renderDurableStoreConnectionConfig(databaseUrl), connectionTimeoutMillis: 10_000 })
  let client
  try {
    client = await pool.connect()
    await client.query('begin transaction read only')
    await client.query("set local statement_timeout = '30s'")
    const result = await client.query('select store_key, value from render_durable_kv where store_key = any($1::text[]) order by store_key', [keys])
    await client.query('commit')
    return new Map(result.rows.map(row => [String(row.store_key), typeof row.value === 'string' ? JSON.parse(row.value) : row.value]))
  } finally {
    if (client) { await client.query('rollback').catch(() => undefined); client.release() }
    await pool.end().catch(() => undefined)
  }
}

async function loadAuthoritativeAgreements(databaseUrl) {
  const keys = ['hashpaylink:arc-agreements:v1', 'hashpaylink:arc-agreement-activation-attempts:v1', 'hashpaylink:arc-agreement-payer-lifecycle:v1']
  const values = await loadStores(databaseUrl, keys)
  const drafts = object(values.get(keys[0])?.agreements)
  const payerActions = Object.values(object(values.get(keys[2])?.actions))
  const attempts = Object.values(object(values.get(keys[1])?.attempts))
  const byAgreement = new Map(attempts.map(attempt => [clean(attempt?.agreementId, 100), attempt]))
  return {
    count: Object.keys(drafts).length,
    snapshot(id) {
      const draft = object(drafts[id])
      const attempt = object(byAgreement.get(id))
      const prepared = object(attempt.prepared)
      const lifecycle = object(attempt.lifecycle)
      const activation = Array.isArray(attempt.transactions) ? attempt.transactions.find(item => item?.stage === 'activation' && item?.status === 'confirmed' && item?.blockNumber) : undefined
      if (!draft.id || draft.partnerId !== attempt.partnerId || !attempt.escrow || !prepared.agreementId || !activation?.blockNumber) throw new Error('AUTHORITATIVE_AGREEMENT_UNAVAILABLE')
      return { id: draft.id, recipient: draft.recipient, payerActions: payerActions.filter(action => action.agreementId === draft.id && action.partnerId === draft.partnerId && action.status === 'confirmed'), chain: { network: 'arc', chainId: ARC_CHAIN_ID, escrow: attempt.escrow,
        onchainAgreementId: prepared.agreementId, termsHash: prepared.termsHash, amountUsdcUnits: prepared.totalAmount,
        releasedUsdcUnits: lifecycle.releasedAmountUsdcUnits || '0', releaseSteps: Array.isArray(prepared.cumulativeReleaseBps) ? prepared.cumulativeReleaseBps.length : 0,
        activationBlockNumber: activation.blockNumber, observedBlockNumber: lifecycle.observedBlockNumber || attempt.observedBlockNumber || '' } }
    },
  }
}

function eventAbi(collection, name) { const event = collection.find(item => item.name === name); if (!event) throw new Error('EVENT_ABI_MISSING'); return event }
function receiptShape(receipt) { return { status: receipt.status, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, logs: receipt.logs.map(log => ({ address: log.address, topics: log.topics, data: log.data, logIndex: Number(log.logIndex) })) } }

const receiptProviders = new WeakMap()
async function transactionReceipt(client, hash) {
  return loadTransactionReceipt(client, hash, receiptProviders.get(client) || [])
}

async function verifyCanonicalReceipt(client, transaction, expected) {
  const block = await client.getBlock({ blockNumber: transaction.blockNumber })
  if (!block.hash) throw new Error('CANONICAL_BLOCK_UNAVAILABLE')
  return verifyConfirmedReceipt(receiptShape(transaction), { ...expected, expectedBlockHash: block.hash })
}

async function exactLog(client, input) {
  const started = Date.now()
  let logs
  try { logs = await client.getLogs(input) } catch {
    logs = []
    for (let start = input.fromBlock; start <= input.toBlock; start += 9_999n) {
      if (Date.now() - started > 60000) throw new Error('HISTORICAL_LOG_SCAN_TIMEOUT')
      const toBlock = start + 9_998n < input.toBlock ? start + 9_998n : input.toBlock
      logs.push(...await client.getLogs({ ...input, fromBlock: start, toBlock }))
    }
  }
  if (logs.length === 0) throw new Error('CONTRACT_EVENT_MISSING')
  if (logs.length !== 1 || !logs[0].transactionHash) throw new Error('CONTRACT_EVENT_AMBIGUOUS')
  return logs[0]
}

async function arcEscrowState(client, escrow) {
  const read = functionName => client.readContract({ address: escrow, abi: ARC_ESCROW_ABI, functionName })
  const [agreementId, termsHash, payer, recipient, token, totalAmount, schedule] = await Promise.all([read('agreementId'), read('termsHash'), read('payer'), read('recipient'), read('usdc'), read('totalAmount'), read('releaseSchedule')])
  return { agreementId, termsHash, payer, recipient, token, totalAmount, schedule }
}

function assertArcSource(event, snapshot, state, escrow) {
  const data = object(event.data)
  const chain = object(snapshot.chain)
  if (snapshot.id !== event.agreementId || Number(chain.chainId) !== ARC_CHAIN_ID || chain.network !== 'arc') throw new Error('AUTHORITATIVE_AGREEMENT_MISMATCH')
  if (address(data.escrow) !== address(chain.escrow) || address(chain.escrow) !== escrow) throw new Error('ESCROW_MISMATCH')
  if (hex32(data.onchainAgreementId) !== hex32(chain.onchainAgreementId) || hex32(chain.onchainAgreementId) !== state.agreementId.toLowerCase()) throw new Error('AGREEMENT_HASH_MISMATCH')
  if (hex32(data.termsHash) !== hex32(chain.termsHash) || hex32(chain.termsHash) !== state.termsHash.toLowerCase()) throw new Error('TERMS_HASH_MISMATCH')
  if (units(data.amountUsdcUnits) !== units(chain.amountUsdcUnits) || units(chain.amountUsdcUnits) !== state.totalAmount) throw new Error('PROTECTED_AMOUNT_MISMATCH')
  if (address(snapshot.recipient) !== state.recipient || state.token !== ARC_USDC) throw new Error('ESCROW_IMMUTABLE_MISMATCH')
  return data
}

async function recoverArc(event, snapshot, client, head, minimumConfirmations) {
  const data = object(event.data)
  const escrow = address(data.escrow)
  const state = await arcEscrowState(client, escrow)
  const source = assertArcSource(event, snapshot, state, escrow)
  const block = units(data.observedBlockNumber, 'OBSERVED_BLOCK_INVALID')
  const activationBlock = units(object(snapshot.chain).activationBlockNumber, 'ACTIVATION_BLOCK_INVALID')
  if (block > head) throw new Error('OBSERVED_BLOCK_AHEAD_OF_CHAIN')
  if (activationBlock > block) throw new Error('ACTIVATION_BLOCK_INVALID')
  const names = { 'agreement.activated': 'AgreementActivated', 'agreement.step_released': 'StepReleased', 'agreement.completed': 'StepReleased', 'agreement.refunded': 'AgreementRefunded', 'agreement.cancelled': 'AgreementCancelled' }
  const eventName = names[event.event]
  if (!eventName) throw new Error('NON_MONETARY_EVENT')
  const expectedStep = eventName === 'StepReleased' ? Number(source.nextStep) - 1 : undefined
  if (eventName === 'StepReleased' && (!Number.isInteger(expectedStep) || expectedStep < 0)) throw new Error('RELEASE_STEP_INVALID')
  const actionName = eventName === 'AgreementRefunded' ? 'refund' : eventName === 'AgreementCancelled' ? 'cancel' : undefined
  const actionHashes = actionName ? [...new Set((snapshot.payerActions || []).filter(action => action.action === actionName && address(action.escrow) === escrow && action.transactionHash).map(action => hex32(action.transactionHash)))] : []
  if (actionHashes.length > 1) throw new Error('PAYER_ACTION_TRANSACTION_AMBIGUOUS')
  let transaction, log
  if (actionHashes.length === 1) {
    transaction = await transactionReceipt(client, actionHashes[0])
    if (transaction.blockNumber < activationBlock || transaction.blockNumber > block) throw new Error('PAYER_ACTION_BLOCK_MISMATCH')
    const matches = transaction.logs.filter(item => address(item.address) === escrow).flatMap(item => {
      try {
        const decoded = decodeEventLog({ abi: [eventAbi(ARC_AGREEMENT_EVENTS, eventName)], topics: item.topics, data: item.data, strict: true })
        return hex32(decoded.args.agreementId) === hex32(state.agreementId) ? [{ ...item, args: decoded.args }] : []
      } catch { return [] }
    })
    if (matches.length !== 1) throw new Error('PAYER_ACTION_EVENT_MISMATCH')
    log = matches[0]
    progress('payer_transaction_recovered')
  } else {
    log = await exactLog(client, { address: escrow, event: eventAbi(ARC_AGREEMENT_EVENTS, eventName),
      args: eventName === 'StepReleased' ? { agreementId: state.agreementId, step: expectedStep } : { agreementId: state.agreementId },
      fromBlock: activationBlock, toBlock: block })
  }
  const args = object(log.args)
  let eventAmounts = {}, eventAddresses = {}, eventHashes = {}, transfer
  if (eventName === 'AgreementActivated') {
    eventAmounts = { amount: state.totalAmount.toString() }
    transfer = { from: state.payer, to: escrow, amountUnits: state.totalAmount.toString() }
  } else if (eventName === 'StepReleased') {
    const step = Number(args.step)
    if (!Number.isInteger(step) || step < 0 || step >= state.schedule.length) throw new Error('RELEASE_STEP_INVALID')
    const current = step === state.schedule.length - 1 ? state.totalAmount : state.totalAmount * BigInt(state.schedule[step]) / 10_000n
    const previous = step === 0 ? 0n : state.totalAmount * BigInt(state.schedule[step - 1]) / 10_000n
    const payout = current - previous
    if (payout <= 0n || units(source.releasedAmountUsdcUnits) !== current) throw new Error('RELEASE_AMOUNT_MISMATCH')
    eventAmounts = { amount: payout.toString(), totalReleased: current.toString() }
    eventHashes = { evidenceHash: hex32(args.evidenceHash, 'EVIDENCE_HASH_INVALID') }
    transfer = { from: escrow, to: state.recipient, amountUnits: payout.toString() }
  } else {
    const refund = state.totalAmount - units(source.releasedAmountUsdcUnits)
    if (refund <= 0n) throw new Error('REFUND_AMOUNT_INVALID')
    eventAmounts = { refundedAmount: refund.toString() }
    if (eventName === 'AgreementCancelled') { eventAddresses = { actor: address(args.actor) }; eventHashes = { reasonHash: hex32(args.reasonHash, 'REASON_HASH_INVALID') } }
    transfer = { from: escrow, to: state.payer, amountUnits: refund.toString() }
  }
  transaction ??= await transactionReceipt(client, log.transactionHash)
  return verifyCanonicalReceipt(client, transaction, { network: 'arc-testnet', chainId: ARC_CHAIN_ID, contractAddress: escrow, tokenAddress: state.token, eventName, identityField: 'agreementId', identity: state.agreementId, expectedBlockNumber: log.blockNumber, headBlockNumber: head, minimumConfirmations, eventAmounts, eventAddresses, eventHashes, transfers: [transfer] })
}

function parseFundingRecord(record, xLayerEscrow) {
  const funding = object(record.fundingRequest)
  if (Number(funding.settlementVersion) !== 3) return undefined
  const signedTerms = object(funding.fundingTerms)
  const terms = object(signedTerms.message)
  const underwriting = object(object(object(object(record.response).decision).onchainOffer).message)
  const hashes = object(funding.transactionHashes)
  const optionalHash = value => value ? hex32(value, 'TRANSACTION_HASH_INVALID') : undefined
  const agreementId = clean(record.agreementId, 100)
  if (!funding.status || !agreementId || address(object(signedTerms.domain).verifyingContract) !== xLayerEscrow) throw new Error('FUNDING_RECORD_INCOMPLETE')
  return { agreementId, status: clean(funding.status, 20), positionId: hex32(terms.offerHash, 'POSITION_ID_INVALID'),
    funder: address(terms.funder), repaymentRecipient: address(terms.repaymentRecipient), provider: address(underwriting.provider),
    providerArcRecipient: address(terms.providerArcRecipient), platformTreasury: address(terms.platformTreasury),
    protectedAmount: units(underwriting.protectedAmount), advanceAmount: units(terms.advanceAmount),
    funderRepaymentAmount: units(terms.funderRepaymentAmount), platformFeeAmount: units(terms.platformFeeAmount),
    termsHash: hex32(underwriting.termsHash), intelligenceCommitment: hex32(underwriting.intelligenceCommitment),
    protectionDeadline: Number(underwriting.protectionDeadline), requestTimestamp: Math.floor(Date.parse(clean(funding.requestedAt, 80)) / 1_000),
    fundingDeadline: Number(terms.deadline), transactionHashes: { funded: optionalHash(hashes.funded), released: optionalHash(hashes.released), settled: optionalHash(hashes.settled) } }
}

async function positionState(client, escrow, id, blockNumber) {
  const value = await client.readContract({ address: escrow, abi: POSITION_ABI, functionName: 'positions', args: [id], blockNumber })
  return { funder: value[0], repaymentRecipient: value[1], provider: value[2], providerArcRecipient: value[3], platformTreasury: value[4], termsHash: value[6], intelligenceCommitment: value[8], arcAgreementHash: value[9], protectedAmount: value[10], advanceAmount: value[11], funderRepaymentAmount: value[12], platformFeeAmount: value[13], protectionDeadline: Number(value[14]), status: Number(value[15]) }
}

function assertPosition(source, position) {
  for (const field of ['funder', 'repaymentRecipient', 'provider', 'providerArcRecipient', 'platformTreasury']) if (source[field] !== position[field]) throw new Error('POSITION_ADDRESS_MISMATCH')
  for (const field of ['termsHash', 'intelligenceCommitment']) if (source[field] !== position[field].toLowerCase()) throw new Error('POSITION_HASH_MISMATCH')
  for (const field of ['protectedAmount', 'advanceAmount', 'funderRepaymentAmount', 'platformFeeAmount']) if (source[field] !== position[field]) throw new Error('POSITION_AMOUNT_MISMATCH')
  if (source.protectionDeadline !== position.protectionDeadline || position.status < 1 || position.status > 3) throw new Error('POSITION_STATE_MISMATCH')
}

async function verifiedLog(client, head, contractAddress, tokenAddress, event, args, expected, minimumConfirmations, fromBlock, toBlock = head, transactionHash) {
  if (transactionHash) {
    const transaction = await transactionReceipt(client, transactionHash)
    return verifyCanonicalReceipt(client, transaction, { ...expected, contractAddress, tokenAddress, expectedBlockNumber: transaction.blockNumber, headBlockNumber: head, minimumConfirmations })
  }
  const log = await exactLog(client, { address: contractAddress, event, args, fromBlock, toBlock })
  const transaction = await transactionReceipt(client, log.transactionHash)
  return verifyCanonicalReceipt(client, transaction, { ...expected, contractAddress, tokenAddress, expectedBlockNumber: log.blockNumber, headBlockNumber: head, minimumConfirmations })
}

async function recoverPosition(source, snapshot, xClient, arcClient, heads, config) {
  progress('upfront_position_read_started')
  const position = await positionState(xClient, config.xLayerEscrow, source.positionId, heads.x)
  if (position.status === 0) return []
  assertPosition(source, position)
  const results = []
  progress('upfront_funding_search_started')
  const positionBlock = (minimumStatus, low = XLAYER_DEPLOYMENT_BLOCK) => firstMatchingBlock(async block => (await positionState(xClient, config.xLayerEscrow, source.positionId, block)).status >= minimumStatus, low, heads.x)
  const fundingFrom = source.transactionHashes.funded ? XLAYER_DEPLOYMENT_BLOCK : await positionBlock(1)
  const fundingTo = source.transactionHashes.funded ? heads.x : fundingFrom
  const funded = await verifiedLog(xClient, heads.x, config.xLayerEscrow, XLAYER_USDC, eventAbi(UPFRONT_EVENTS, 'AdvanceFunded'), { positionId: source.positionId }, {
    network: 'xlayer-mainnet', chainId: XLAYER_CHAIN_ID, eventName: 'AdvanceFunded', identityField: 'positionId', identity: source.positionId,
    eventAmounts: { protectedAmount: source.protectedAmount.toString(), advanceAmount: source.advanceAmount.toString(), funderRepaymentAmount: source.funderRepaymentAmount.toString(), platformFeeAmount: source.platformFeeAmount.toString(), protectionDeadline: String(source.protectionDeadline) },
    eventAddresses: { funder: source.funder, provider: source.provider, repaymentRecipient: source.repaymentRecipient, providerArcRecipient: source.providerArcRecipient, platformTreasury: source.platformTreasury },
    eventHashes: { termsHash: source.termsHash, intelligenceCommitment: source.intelligenceCommitment },
    transfers: [{ from: source.funder, to: config.xLayerEscrow, amountUnits: source.advanceAmount.toString() }],
  }, config.confirmations, fundingFrom, fundingTo, source.transactionHashes.funded)
  results.push(funded)
  progress('upfront_funding_recovered')
  if (position.status === 2) {
    const chain = object(snapshot.chain)
    const arcAgreementHash = hex32(chain.onchainAgreementId, 'ARC_AGREEMENT_HASH_INVALID')
    const arcTermsHash = hex32(chain.termsHash)
    if (position.arcAgreementHash.toLowerCase() !== arcAgreementHash) throw new Error('POSITION_ARC_PROTECTION_MISMATCH')
    const arcState = await arcEscrowState(arcClient, address(chain.escrow))
    if (hex32(arcState.agreementId) !== arcAgreementHash || hex32(arcState.termsHash) !== arcTermsHash
      || arcState.totalAmount !== source.protectedAmount || arcState.recipient !== config.arcRouter || arcState.token !== ARC_USDC) throw new Error('ARC_PROTECTION_IMMUTABLE_MISMATCH')
    const protectionFrom = source.transactionHashes.released ? BigInt(funded.blockNumber) : await positionBlock(2, BigInt(funded.blockNumber)); const protectionTo = source.transactionHashes.released ? heads.x : protectionFrom
    results.push(await verifiedLog(xClient, heads.x, config.xLayerEscrow, XLAYER_USDC, eventAbi(UPFRONT_EVENTS, 'AdvanceReleased'), { positionId: source.positionId }, {
      network: 'xlayer-mainnet', chainId: XLAYER_CHAIN_ID, eventName: 'AdvanceReleased', identityField: 'positionId', identity: source.positionId,
      eventAmounts: { advanceAmount: source.advanceAmount.toString() }, eventAddresses: { provider: source.provider }, eventHashes: { arcAgreementHash },
      transfers: [{ from: config.xLayerEscrow, to: source.provider, amountUnits: source.advanceAmount.toString() }],
    }, config.confirmations, protectionFrom, protectionTo, source.transactionHashes.released))
    progress('upfront_release_recovered')
    const settled = await arcClient.readContract({ address: config.arcRouter, abi: ROUTER_ABI, functionName: 'settledAgreements', args: [arcAgreementHash] })
    if (source.status === 'settled' && !settled) throw new Error('SOURCE_SETTLEMENT_STATE_MISMATCH')
    if (settled) {
      const settlementFrom = source.transactionHashes.settled ? ROUTER_DEPLOYMENT_BLOCK : await firstMatchingBlock(blockNumber => arcClient.readContract({ address: config.arcRouter, abi: ROUTER_ABI, functionName: 'settledAgreements', args: [arcAgreementHash], blockNumber }), ROUTER_DEPLOYMENT_BLOCK, heads.arc)
      const settlementTo = source.transactionHashes.settled ? heads.arc : settlementFrom
      const providerAmount = source.protectedAmount - source.funderRepaymentAmount - source.platformFeeAmount
      if (providerAmount <= 0n) throw new Error('SPLIT_AMOUNT_INVALID')
      results.push(await verifiedLog(arcClient, heads.arc, config.arcRouter, ARC_USDC, eventAbi(REPAYMENT_EVENTS, 'RepaymentSettled'), { arcAgreementHash }, {
        network: 'arc-testnet', chainId: ARC_CHAIN_ID, eventName: 'RepaymentSettled', identityField: 'arcAgreementHash', identity: arcAgreementHash,
        eventAmounts: { funderAmount: source.funderRepaymentAmount.toString(), providerAmount: providerAmount.toString(), treasuryAmount: source.platformFeeAmount.toString() },
        eventAddresses: { funder: source.repaymentRecipient, provider: source.providerArcRecipient, treasury: source.platformTreasury }, eventHashes: { arcTermsHash },
        transfers: [{ from: config.arcRouter, to: source.repaymentRecipient, amountUnits: source.funderRepaymentAmount.toString() }, { from: config.arcRouter, to: source.providerArcRecipient, amountUnits: providerAmount.toString() }, { from: config.arcRouter, to: source.platformTreasury, amountUnits: source.platformFeeAmount.toString() }],
      }, config.confirmations, settlementFrom, settlementTo, source.transactionHashes.settled))
    }
  } else if (position.status === 3) {
    const refundBlock = await positionBlock(2, BigInt(funded.blockNumber))
    results.push(await verifiedLog(xClient, heads.x, config.xLayerEscrow, XLAYER_USDC, eventAbi(UPFRONT_EVENTS, 'AdvanceRefunded'), { positionId: source.positionId }, {
      network: 'xlayer-mainnet', chainId: XLAYER_CHAIN_ID, eventName: 'AdvanceRefunded', identityField: 'positionId', identity: source.positionId,
      eventAmounts: { advanceAmount: source.advanceAmount.toString() }, eventAddresses: { funder: source.funder }, eventHashes: {}, transfers: [{ from: config.xLayerEscrow, to: source.funder, amountUnits: source.advanceAmount.toString() }],
    }, config.confirmations, refundBlock, refundBlock))
  }
  return results
}

async function indexAll(databaseUrl, receipts) {
  const pool = new Pool({ ...renderDurableStoreConnectionConfig(databaseUrl), connectionTimeoutMillis: 10_000 })
  const client = await pool.connect()
  const counts = { indexed: 0, duplicate: 0 }
  try {
    await client.query('begin')
    await client.query("set local statement_timeout = '30s'")
    const table = await client.query("select to_regclass('hashpaystream.chain_observations') as relation")
    if (!table.rows[0]?.relation) throw new Error('TARGET_FINANCIAL_SCHEMA_MISSING')
    for (const receipt of receipts) counts[(await indexVerifiedChainReceipt(client, receipt)).status] += 1
    await client.query('commit')
    return counts
  } catch (reason) { await client.query('rollback').catch(() => undefined); throw reason }
  finally { client.release(); await pool.end().catch(() => undefined) }
}

function netTransfers(receipts, accounts) {
  const selected = new Set(accounts.map(item => item.toLowerCase()))
  let net = 0n
  for (const receipt of receipts) for (const transfer of receipt.payload.transfers) {
    const amount = BigInt(transfer.amountUnits)
    if (selected.has(transfer.to)) net += amount
    if (selected.has(transfer.from)) net -= amount
  }
  return net
}

async function balanceComparison(receipts, arcClient, xClient, config, heads) {
  const agreementEvents = new Set(['AgreementActivated', 'StepReleased', 'AgreementRefunded', 'AgreementCancelled'])
  const escrows = [...new Set(receipts.filter(item => item.payload.network === 'arc-testnet' && agreementEvents.has(item.payload.eventName)).map(item => item.payload.contractAddress))]
  const escrowBalances = await Promise.all(escrows.map(account => arcClient.readContract({ address: ARC_USDC, abi: BALANCE_ABI, functionName: 'balanceOf', args: [account], blockNumber: heads.arc })))
  const [xEscrowBalance, routerBalance] = await Promise.all([
    xClient.readContract({ address: XLAYER_USDC, abi: BALANCE_ABI, functionName: 'balanceOf', args: [config.xLayerEscrow], blockNumber: heads.x }),
    arcClient.readContract({ address: ARC_USDC, abi: BALANCE_ABI, functionName: 'balanceOf', args: [config.arcRouter], blockNumber: heads.arc }),
  ])
  const agreementExpected = netTransfers(receipts, escrows)
  const xExpected = netTransfers(receipts, [config.xLayerEscrow])
  const routerExpected = netTransfers(receipts, [config.arcRouter])
  const agreementObserved = escrowBalances.reduce((total, value) => total + value, 0n)
  return {
    agreementEscrows: { matched: agreementExpected === agreementObserved, expectedUnits: agreementExpected.toString(), observedUnits: agreementObserved.toString(), count: escrows.length },
    xLayerAdvanceEscrow: { matched: xExpected === xEscrowBalance, expectedUnits: xExpected.toString(), observedUnits: xEscrowBalance.toString() },
    arcRepaymentRouter: { matched: routerExpected === routerBalance, expectedUnits: routerExpected.toString(), observedUnits: routerBalance.toString() },
  }
}

function progress(stage, counts = {}) {
  if (process.env.HASHPAYSTREAM_RECEIPT_AUDIT_PROGRESS === '1') console.error(JSON.stringify({ component: 'chain-receipt-audit', stage, ...counts }))
}

async function main() {
  const config = configuration()
  progress('source_read_started')
  const values = await loadStores(config.source, [...config.stores.map(item => item.key), config.assessmentStore])
  const authoritative = await loadAuthoritativeAgreements(config.authoritative)
  progress('source_read_complete', { stores: values.size, agreements: authoritative.count })
  const transport = urls => fallback(urls.map(url => http(url, { timeout: 8_000, retryCount: 0 })), { retryCount: 0 })
  const arcClient = createPublicClient({ transport: transport(config.arcRpcs) })
  const xClient = createPublicClient({ transport: transport(config.xLayerRpcs) })
  receiptProviders.set(arcClient, config.arcRpcs.map(url => createPublicClient({ transport: http(url, { timeout: 8_000, retryCount: 0 }) })))
  receiptProviders.set(xClient, config.xLayerRpcs.map(url => createPublicClient({ transport: http(url, { timeout: 8_000, retryCount: 0 }) })))
  const [arcChain, xChain, arcHead, xHead, xAsset, routerAsset] = await Promise.all([
    arcClient.getChainId(), xClient.getChainId(), arcClient.getBlockNumber(), xClient.getBlockNumber(),
    xClient.readContract({ address: config.xLayerEscrow, abi: ASSET_ABI, functionName: 'asset' }),
    arcClient.readContract({ address: config.arcRouter, abi: ASSET_ABI, functionName: 'asset' }),
  ])
  if (arcChain !== ARC_CHAIN_ID || xChain !== XLAYER_CHAIN_ID || xAsset !== XLAYER_USDC || routerAsset !== ARC_USDC) throw new Error('CHAIN_CONFIGURATION_MISMATCH')
  progress('chain_configuration_verified')
  const snapshots = new Map()
  const snapshot = id => {
    if (!snapshots.has(id)) snapshots.set(id, authoritative.snapshot(id))
    return snapshots.get(id)
  }
  const receipts = [], blocked = {}, recovered = {}
  const register = result => {
    if (!result.verified) { for (const item of result.codes) blocked[item] = (blocked[item] || 0) + 1; return }
    receipts.push(result)
    recovered[result.payload.eventName] = (recovered[result.payload.eventName] || 0) + 1
  }
  for (const store of config.stores) {
    for (const event of Object.values(object(values.get(store.key)?.events))) {
      if (!['agreement.activated', 'agreement.step_released', 'agreement.completed', 'agreement.refunded', 'agreement.cancelled'].includes(event?.event)) continue
      progress('arc_event_started', { receipts: receipts.length, event: event.event })
      try { register(await recoverArc(event, snapshot(clean(event.agreementId, 100)), arcClient, arcHead, config.confirmations)) }
      catch (reason) { const key = `ARC_${event.event.replace(/^agreement\./, '').toUpperCase()}_${errorCode(reason)}`; blocked[key] = (blocked[key] || 0) + 1; progress('evidence_blocked', { code: key }) }
    }
  }
  progress('arc_recovery_complete', { receipts: receipts.length, blocked: Object.values(blocked).reduce((sum, count) => sum + count, 0) })
  const seenPositions = new Set()
  for (const record of Object.values(object(values.get(config.assessmentStore)?.records))) {
    if (!record?.fundingRequest) continue
    try {
      const source = parseFundingRecord(record, config.xLayerEscrow)
      if (!source) continue
      if (seenPositions.has(source.positionId)) continue
      seenPositions.add(source.positionId)
      for (const result of await recoverPosition(source, snapshot(source.agreementId), xClient, arcClient, { arc: arcHead, x: xHead }, config)) register(result)
    } catch (reason) { const key = `UPFRONT_${errorCode(reason)}`; blocked[key] = (blocked[key] || 0) + 1; progress('evidence_blocked', { code: key }) }
  }
  const unique = new Map(receipts.map(item => [`${item.payload.network}:${item.transactionHash}:${item.logIndex}`, item]))
  if (unique.size !== receipts.length) throw new Error('DUPLICATE_RECEIPT_EVIDENCE')
  const verified = [...unique.values()]
  let balances = { status: 'not_run', reason: 'receipt_evidence_incomplete' }
  if (Object.keys(blocked).length === 0) {
    balances = { status: 'complete', results: await balanceComparison(verified, arcClient, xClient, config, { arc: arcHead, x: xHead }) }
    if (!Object.values(balances.results).every(item => item.matched)) blocked.BALANCE_RECONCILIATION_MISMATCH = 1
  }
  let firstPass = { indexed: 0, duplicate: 0 }, secondPass = { indexed: 0, duplicate: 0 }
  if (config.write && Object.keys(blocked).length === 0) {
    firstPass = await indexAll(config.target, verified)
    secondPass = await indexAll(config.target, verified)
    if (secondPass.indexed !== 0 || secondPass.duplicate !== verified.length) throw new Error('STAGING_IDEMPOTENCY_CHECK_FAILED')
  }
  const byNetwork = verified.reduce((all, item) => { all[item.payload.network] = (all[item.payload.network] || 0) + 1; return all }, {})
  console.log(JSON.stringify({ ok: Object.keys(blocked).length === 0, schema: 'hashpaystream.chain-receipt-backfill.v1', mode: config.write ? 'staging-write' : 'read-only', sourceStoresExpected: config.stores.length + 1, sourceStoresRead: values.size, authoritativeAgreementRecords: authoritative.count, authoritativeAgreementsQueried: snapshots.size, positionsExamined: seenPositions.size, receiptsVerified: verified.length, byNetwork, events: Object.fromEntries(Object.entries(recovered).sort()), blocked: Object.fromEntries(Object.entries(blocked).sort()), balanceComparison: balances, stagingFirstPass: firstPass, stagingSecondPass: secondPass, productionWrites: 0 }))
  if (Object.keys(blocked).length) process.exitCode = 2
}

main().catch(reason => { console.error(JSON.stringify({ ok: false, error: errorCode(reason).toLowerCase(), productionWrites: 0 })); process.exitCode = 1 })
