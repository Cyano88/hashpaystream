import { createHmac } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { createPublicClient, getAddress, http, isAddress, parseEventLogs, type Address, type Hex } from 'viem'
import { fundingPartnerAccountKey, type FundingPartnerStore } from './funding-partners.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './durable-store.js'
import type { UpfrontAssessmentRecord, UpfrontAssessmentStore } from './upfront-assessment.js'
import {
  createStockDeliveryRequest, declineStockDelivery, recordVerifiedStockDelivery, safeStockDeliveryStore,
  stockDeliveryRequestsForFunder, stockDeliveryRequestsForWorker, type StockDeliveryStore, type VerifiedStockDeliveryReceipt,
} from './stock-delivery-workflow.js'
import { AGREEMENT_BACKED_STOCK_DELIVERY_ABI, type StockDeliveryAuthorization } from '../src/lib/stockDeliveryProtocol.js'
import { quoteStockDeliveryFees } from './stock-delivery-terms.js'
import { listProductionStockDeliveryOffers, type StockDeliveryOfferOption, type StockDeliveryRuntime } from './stock-delivery-offers.js'

const DEFAULT_ASSESSMENT_STORE = 'hashpaystream:upfront-assessments:v1'
const DEFAULT_PARTNER_STORE = 'hashpaystream:funding-partners:v1'
const DEFAULT_DELIVERY_STORE = 'hashpaystream:stock-deliveries:v1'
type Identity = { userId: string; emails: string[]; wallet: Address }
type Config = { secret: string; assessmentStore: string; partnerStore: string; deliveryStore: string; chainId: number; rpcUrl: string; contract: Address; asset: Address; treasury: Address; arcRepaymentRouter: Address; runtimeHash: Hex; underwritingSigner: Address; riskSigner: Address; protectionSigner: Address; confirmations: number; requestsEnabled: boolean }
type Dependencies = {
  identity: (req: Request, env: NodeJS.ProcessEnv) => Promise<Identity>
  hasStore: () => boolean
  readAssessments: (key: string) => Promise<UpfrontAssessmentStore | undefined>
  readPartners: (key: string) => Promise<FundingPartnerStore | undefined>
  readDeliveries: (key: string) => Promise<StockDeliveryStore | undefined>
  mutateDeliveries: (key: string, update: (value: StockDeliveryStore | undefined) => StockDeliveryStore | Promise<StockDeliveryStore>) => Promise<StockDeliveryStore>
  verifyReceipt: (hash: Hex, authorization: StockDeliveryAuthorization, config: Config) => Promise<VerifiedStockDeliveryReceipt>
  offers: (input: { record: UpfrontAssessmentRecord; partners: FundingPartnerStore | undefined; worker: Address; runtime: StockDeliveryRuntime; env: NodeJS.ProcessEnv }) => Promise<StockDeliveryOfferOption[]>
  env: () => NodeJS.ProcessEnv
  now: () => Date
}
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function clean(value: unknown, max: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }
function address(value: unknown, label: string) { const text = clean(value, 42); if (!isAddress(text) || /^0x0{40}$/i.test(text)) fail(`${label} is unavailable.`, 503); return getAddress(text) }
function configuration(env: NodeJS.ProcessEnv): Config {
  const secret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300), chainId = Number(env.HASHPAYSTREAM_STOCK_DELIVERY_CHAIN_ID ?? 196)
  const rpcUrl = clean(env.HASHPAYSTREAM_XLAYER_RPC_URL, 240), confirmations = Number(env.HASHPAYSTREAM_STOCK_DELIVERY_CONFIRMATIONS ?? 2)
  let rpc: URL
  try { rpc = new URL(rpcUrl) } catch { fail('Stock delivery configuration is unavailable.', 503) }
  const runtimeHash = clean(env.HASHPAYSTREAM_STOCK_DELIVERY_RUNTIME_HASH, 66)
  if (secret.length < 32 || chainId !== 196 || rpc!.protocol !== 'https:' || rpc!.username || rpc!.password || !/^0x[a-fA-F0-9]{64}$/.test(runtimeHash) || !Number.isInteger(confirmations) || confirmations < 1 || confirmations > 64) fail('Stock delivery configuration is unavailable.', 503)
  return {
    secret, chainId, rpcUrl: rpc!.toString(), confirmations,
    assessmentStore: clean(env.HASHPAYSTREAM_UPFRONT_ASSESSMENT_STORE_KEY ?? DEFAULT_ASSESSMENT_STORE, 160),
    partnerStore: clean(env.HASHPAYSTREAM_FUNDING_PARTNER_STORE_KEY ?? DEFAULT_PARTNER_STORE, 160),
    deliveryStore: clean(env.HASHPAYSTREAM_STOCK_DELIVERY_STORE_KEY ?? DEFAULT_DELIVERY_STORE, 160),
    contract: address(env.HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS, 'Stock delivery contract'),
    asset: address(env.HASHPAYSTREAM_STOCK_ASSET_ADDRESS, 'Stock asset'),
    treasury: address(env.HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS, 'Platform treasury'),
    arcRepaymentRouter: address(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 'Arc repayment router'),
    runtimeHash: runtimeHash as Hex,
    underwritingSigner: address(env.HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER, 'Stock underwriting signer'),
    riskSigner: address(env.HASHPAYSTREAM_STOCK_RISK_SIGNER, 'Stock risk signer'),
    protectionSigner: address(env.HASHPAYSTREAM_STOCK_PROTECTION_SIGNER, 'Stock protection signer'),
    requestsEnabled: env.HASHPAYSTREAM_STOCK_DELIVERY_REQUESTS_ENABLED === 'true',
  }
}
async function verifiedIdentity(req: Request, env: NodeJS.ProcessEnv): Promise<Identity> {
  const token = String(req.headers.authorization ?? '').match(/^Bearer\s+(\S+)$/i)?.[1]
  const appId = clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180), appSecret = clean(env.PRIVY_APP_SECRET, 300)
  if (!token || !appId || !appSecret) fail('Sign in to continue.', 401)
  try {
    const privy = new PrivyClient({ appId, appSecret }), claims = await privy.utils().auth().verifyAccessToken(token)
    const user = await privy.users()._get(clean(claims.user_id, 180))
    const emails = [...new Set(user.linked_accounts.flatMap(item => item.type === 'email' ? [clean(item.address, 254).toLowerCase()] : []))]
    const wallets = [...new Set(user.linked_accounts.flatMap(item => item.type === 'wallet' && item.chain_type === 'ethereum' && item.wallet_client_type === 'privy' && item.connector_type === 'embedded' && isAddress(item.address) ? [getAddress(item.address)] : []))]
    if (!claims.user_id || !emails.length || wallets.length !== 1) fail('Your verified HashPayStream identity is incomplete.', 409)
    return { userId: claims.user_id, emails, wallet: wallets[0] }
  } catch (error) { if ((error as { status?: number }).status) throw error; fail('Your HashPayStream session is invalid or expired.', 401) }
}
function partnerFor(identity: Identity, partners: FundingPartnerStore | undefined, secret: string) {
  const keys = identity.emails.map(email => fundingPartnerAccountKey(secret, email))
  return Object.values(partners?.applications ?? {}).find(item => item.status === 'approved' && keys.includes(item.accountKey) && item.walletAddress && isAddress(item.walletAddress) && getAddress(item.walletAddress) === identity.wallet)
}
function assessmentFor(identity: Identity, store: UpfrontAssessmentStore | undefined, requestId: string, secret: string) {
  const owner = 'hps_provider_' + createHmac('sha256', secret).update('upfront\0' + identity.userId).digest('hex').slice(0, 32)
  return Object.values(store?.records ?? {}).find(item => item.ownerReference === owner && item.request?.requestId === requestId && item.status === 'completed')
}
function approved(record: UpfrontAssessmentRecord | undefined) { return (record?.response?.decision as { decision?: string } | undefined)?.decision === 'APPROVE' }
function completedFundingCounts(store: UpfrontAssessmentStore | undefined) {
  const counts = new Map<string, number>(), seen = new Set<string>()
  for (const record of Object.values(store?.records ?? {})) {
    const funding = record.fundingRequest, evidence = funding?.settlementEvidence
    if (funding?.settlementVersion !== 3 || funding.status !== 'settled' || !evidence || evidence.chainId !== 5_042_002
      || !/^0x[a-fA-F0-9]{64}$/.test(evidence.transactionHash) || !/^0x[a-fA-F0-9]{64}$/.test(evidence.agreementHash)
      || seen.has(evidence.agreementHash.toLowerCase())) continue
    seen.add(evidence.agreementHash.toLowerCase())
    counts.set(funding.partnerApplicationId, (counts.get(funding.partnerApplicationId) ?? 0) + 1)
  }
  return counts
}
async function verifyReceipt(hash: Hex, authorization: StockDeliveryAuthorization, config: Config): Promise<VerifiedStockDeliveryReceipt> {
  const client = createPublicClient({ transport: http(config.rpcUrl, { retryCount: 0, timeout: 7_000 }) })
  const [chainId, receipt, head] = await Promise.all([client.getChainId(), client.getTransactionReceipt({ hash }), client.getBlockNumber()])
  if (chainId !== config.chainId || receipt.status !== 'success' || receipt.transactionHash !== hash || head - receipt.blockNumber + 1n < BigInt(config.confirmations)) fail('The stock delivery transaction is not confirmed.', 409)
  const events = parseEventLogs({ abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, eventName: 'StockDelivered', logs: receipt.logs.filter(log => !log.removed && getAddress(log.address) === config.contract) })
  if (events.length !== 1) fail('The stock delivery event is missing or ambiguous.', 409)
  const args = events[0].args
  if (args.deliveryId !== authorization.deliveryId || args.arcAgreementHash !== authorization.protection.arcAgreementHash || getAddress(args.worker) !== getAddress(authorization.offer.worker)
    || getAddress(args.funder) !== getAddress(authorization.terms.funder) || getAddress(args.stockAsset) !== getAddress(authorization.terms.stockAsset) || args.stockTokenAmount.toString() !== authorization.terms.stockTokenAmount) fail('The stock delivery event does not match the signed request.', 409)
  return { transactionHash: hash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber.toString(), deliveryId: args.deliveryId, arcAgreementHash: args.arcAgreementHash, worker: getAddress(args.worker), funder: getAddress(args.funder), stockAsset: getAddress(args.stockAsset), stockTokenAmount: args.stockTokenAmount.toString(), confirmedAt: new Date().toISOString() }
}
const defaults: Dependencies = { identity: verifiedIdentity, hasStore: hasRenderDurableStore, readAssessments: key => readDurableJson(key), readPartners: key => readDurableJson(key), readDeliveries: key => readDurableJson(key), mutateDeliveries: (key, update) => mutateDurableJson(key, update), verifyReceipt, offers: listProductionStockDeliveryOffers, env: () => process.env, now: () => new Date() }

export function createStockDeliveryOpportunitiesHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function stockDeliveryOpportunities(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization')
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      if (!dependencies.hasStore()) fail('Stock delivery storage is unavailable.', 503)
      const env = dependencies.env(), config = configuration(env), identity = await dependencies.identity(req, env)
      const [deliveries, partners] = await Promise.all([dependencies.readDeliveries(config.deliveryStore), dependencies.readPartners(config.partnerStore)])
      const profile = partnerFor(identity, partners, config.secret)
      if (req.method === 'GET') {
        const view = clean(req.query.view ?? 'worker', 20)
        if (view === 'worker') return res.json({ ok: true, requests: stockDeliveryRequestsForWorker(deliveries, identity.userId), executionEnabled: false })
        if (view === 'partners') {
          const requestId = clean(req.query.requestId, 100), assessments = await dependencies.readAssessments(config.assessmentStore)
          const record = assessmentFor(identity, assessments, requestId, config.secret)
          if (!record || !approved(record) || !record.agreementId) fail('The approved stock opportunity was not found.', 404)
          const prior = stockDeliveryRequestsForWorker(deliveries, identity.userId).find(item => item.assessmentRequestId === requestId)
          if (prior) return res.json({ ok: true, offers: [], selection: prior, executionEnabled: false })
          if (!config.requestsEnabled) fail('Stock delivery requests are paused.', 503)
          const offers = await dependencies.offers({ record, partners, worker: identity.wallet, runtime: { chainId: config.chainId, contract: config.contract, asset: config.asset, treasury: config.treasury, arcRepaymentRouter: config.arcRepaymentRouter, runtimeHash: config.runtimeHash, rpcUrl: config.rpcUrl, underwritingSigner: config.underwritingSigner, riskSigner: config.riskSigner, protectionSigner: config.protectionSigner }, env })
          const counts = completedFundingCounts(assessments)
          const ranked = offers.map(offer => ({ ...offer, verifiedCompletedFundingCount: counts.get(offer.partnerId) ?? 0 }))
            .sort((left, right) => right.verifiedCompletedFundingCount - left.verifiedCompletedFundingCount || left.feeBps - right.feeBps || left.partnerId.localeCompare(right.partnerId))
          return res.json({ ok: true, offers: ranked, selection: null, executionEnabled: true })
        }
        if (view === 'funder') { if (!profile) fail('An approved funding profile is required.', 403); return res.json({ ok: true, requests: stockDeliveryRequestsForFunder(deliveries, profile.id), executionEnabled: false }) }
        fail('Stock delivery view is invalid.', 400)
      }
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}, action = clean(body.action, 32)
      if (!config.requestsEnabled) fail('Stock delivery requests are paused.', 503)
      if (action === 'select_offer') {
        const requestId = clean(body.requestId, 100), agreementId = clean(body.agreementId, 80), partnerId = clean(body.partnerId, 80)
        const assessments = await dependencies.readAssessments(config.assessmentStore), record = assessmentFor(identity, assessments, requestId, config.secret)
        const partner = partners?.applications?.[partnerId]
        if (!record || !approved(record) || record.agreementId !== agreementId || !record.request) fail('The approved stock opportunity was not found.', 404)
        if (!partner || partner.status !== 'approved' || partner.stockOffersEnabled !== true || !Number.isInteger(partner.stockFeeBps) || partner.stockFeeBps! < 1 || partner.stockFeeBps! > 300 || !partner.walletAddress) fail('The selected funding partner is unavailable.', 409)
        const authorization = body.authorization as StockDeliveryAuthorization, workerSignature = clean(body.workerSignature, 4_200) as Hex
        if (!authorization || typeof authorization !== 'object' || !authorization.offer || !authorization.terms || !authorization.protection || !/^0x[a-fA-F0-9]{130}$/.test(workerSignature)) fail('The signed stock delivery offer is invalid.', 400)
        const currentQuote = quoteStockDeliveryFees({ protectedAmount: BigInt(record.request.agreement.amountUsdcUnits), advanceAmount: BigInt(record.request.advance.requestedUsdcUnits), feeBps: partner.stockFeeBps! })
        if (authorization.terms.funderRepaymentAmount !== currentQuote.funderRepaymentUsdcUnits || authorization.terms.platformFeeAmount !== currentQuote.platformFeeUsdcUnits) fail('The selected stock offer changed. Refresh offers and choose again.', 409)
        const selectedAt = dependencies.now()
        let selected
        await dependencies.mutateDeliveries(config.deliveryStore, async current => {
          const result = await createStockDeliveryRequest(current, { assessmentRequestId: requestId, agreementId, workerUserId: identity.userId, partnerApplicationId: partner.id, authorization, workerSignature, expected: { chainId: config.chainId, deliveryContract: config.contract, worker: identity.wallet, workerArcRecipient: getAddress(record.request!.settlement.providerRecipient), funder: getAddress(partner.walletAddress!), repaymentRecipient: getAddress(partner.walletAddress!), platformTreasury: config.treasury, stockAsset: config.asset, advanceUsdcAmount: record.request!.advance.requestedUsdcUnits, underwritingSigner: config.underwritingSigner, riskSigner: config.riskSigner, protectionSigner: config.protectionSigner, now: Math.floor(selectedAt.getTime() / 1000) }, now: selectedAt })
          selected = result.request; return result.store
        })
        return res.status(201).json({ ok: true, request: selected })
      }
      if (!profile) fail('An approved funding profile is required.', 403)
      const deliveryId = clean(body.deliveryId, 66) as Hex
      if (!/^0x[a-fA-F0-9]{64}$/.test(deliveryId)) fail('Stock delivery reference is invalid.', 400)
      let updated
      if (action === 'decline') await dependencies.mutateDeliveries(config.deliveryStore, current => { const result = declineStockDelivery(current, { deliveryId, partnerApplicationId: profile.id, funder: identity.wallet, now: dependencies.now() }); updated = result.request; return result.store })
      else if (action === 'confirm_delivery') {
        const current = safeStockDeliveryStore(deliveries), pending = current.requests[deliveryId]
        if (!pending || pending.partnerApplicationId !== profile.id) fail('Stock delivery request was not found.', 404)
        const transactionHash = clean(body.transactionHash, 66) as Hex
        if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) fail('Stock delivery transaction is invalid.', 400)
        const receipt = await dependencies.verifyReceipt(transactionHash, pending.authorization, config)
        await dependencies.mutateDeliveries(config.deliveryStore, value => { const result = recordVerifiedStockDelivery(value, { deliveryId, partnerApplicationId: profile.id, funder: identity.wallet, receipt, now: dependencies.now() }); updated = result.request; return result.store })
      } else fail('Stock delivery action is invalid.', 400)
      return res.json({ ok: true, request: updated })
    } catch (error) { const status = Number((error as { status?: number }).status) || 500; return res.status(status).json({ ok: false, error: status >= 500 ? 'Stock delivery is temporarily unavailable.' : (error as Error).message }) }
  }
}
export default createStockDeliveryOpportunitiesHandler()
