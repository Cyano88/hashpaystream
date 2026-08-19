import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { getAddress, type Address } from 'viem'
import { mutateDurableJson } from './durable-store.js'
import { agreementIntelligencePayloadHash, agreementIntelligenceRequestHash, buildAgreementIntelligenceRequest, validateUpfrontDraft, type AgreementIntelligenceRequest } from './agreement-intelligence-schema.js'
import { requestPolyDeskUnderwriting, type PolyDeskDecision } from './polydesk-upfront-client.js'

const DEFAULT_STORE_KEY = 'hashpaystream:upfront-assessments:v1'
type AssessmentRecord = { ownerReference: string; requestHash: string; status: 'pending' | 'completed'; createdAt: string; request?: AgreementIntelligenceRequest; response?: Record<string, unknown> }
type AssessmentStore = { schema: 1; records: Record<string, AssessmentRecord> }

export type UpfrontAssessmentDependencies = {
  identity: (req: Request) => Promise<string>
  mutate: (key: string, update: (current: AssessmentStore | undefined) => AssessmentStore) => Promise<AssessmentStore>
  assess: (request: AgreementIntelligenceRequest, config: { baseUrl: string; apiKey: string }) => Promise<{ status: number; body: Record<string, unknown> }>
  underwrite: (request: AgreementIntelligenceRequest, intelligence: ReturnType<typeof safeAssessmentResponse>, config: {
    baseUrl: string; serviceToken: string; signingSecret: string; expectedKeyId?: string
    expectedSigner: Address; escrowContract: Address; chainId: number; now: Date
  }) => Promise<PolyDeskDecision>
  env: () => NodeJS.ProcessEnv
  now: () => Date
  requestId: (identity: string, idempotencyKey: string) => string
}

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function httpError(message: string, status: number) { return Object.assign(new Error(message), { status }) }
function bearer(req: Pick<Request, 'headers'>) { return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '' }

async function verifiedIdentity(req: Request) {
  const appId = clean(process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(process.env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) throw httpError('HashPayStream authentication is unavailable.', 503)
  if (!token) throw httpError('Sign in to request an Upfront assessment.', 401)
  try {
    const claims = await new PrivyClient({ appId, appSecret }).utils().auth().verifyAccessToken(token)
    const userId = clean(claims.user_id, 180)
    if (!userId) throw new Error('Privy identity is empty.')
    return userId
  } catch (cause) {
    throw Object.assign(httpError('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function configuration(env: NodeJS.ProcessEnv) {
  if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') throw httpError('HashPayStream Upfront is not enabled.', 404)
  const apiKey = clean(env.HASHPAYSTREAM_ZEROSCOUT_API_KEY, 300)
  const polyDeskServiceToken = clean(env.HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN, 300)
  const polyDeskSigningSecret = clean(env.HASHPAYSTREAM_POLYDESK_SIGNING_SECRET, 300)
  const polyDeskSigningKeyId = clean(env.HASHPAYSTREAM_POLYDESK_SIGNING_KEY_ID, 80)
  const polyDeskExpectedSigner = clean(env.HASHPAYSTREAM_POLYDESK_EIP712_SIGNER, 42)
  const polyDeskEscrowContract = clean(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const polyDeskChainId = Number(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID ?? 1952)
  const secret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const storeKey = clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
  let baseUrl: URL
  let polyDeskBaseUrl: URL
  try { baseUrl = new URL(clean(env.HASHPAYSTREAM_ZEROSCOUT_BASE_URL, 240)) } catch { throw httpError('ZeroScout Agreement Intelligence is not configured.', 503) }
  try { polyDeskBaseUrl = new URL(clean(env.HASHPAYSTREAM_POLYDESK_BASE_URL, 240)) } catch { throw httpError('PolyDesk Upfront underwriting is not configured.', 503) }
  const localHttp = baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)
  const polyDeskLocalHttp = polyDeskBaseUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(polyDeskBaseUrl.hostname)
  if ((baseUrl.protocol !== 'https:' && !localHttp) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw httpError('ZeroScout Agreement Intelligence URL is invalid.', 503)
  if ((polyDeskBaseUrl.protocol !== 'https:' && !polyDeskLocalHttp) || polyDeskBaseUrl.username || polyDeskBaseUrl.password || polyDeskBaseUrl.search || polyDeskBaseUrl.hash) throw httpError('PolyDesk Upfront underwriting URL is invalid.', 503)
  if (
    apiKey.length < 16 || secret.length < 32 || polyDeskServiceToken.length < 32 || polyDeskSigningSecret.length < 32 || !storeKey
    || !/^0x[a-fA-F0-9]{40}$/.test(polyDeskExpectedSigner) || /^0x0{40}$/i.test(polyDeskExpectedSigner)
    || !/^0x[a-fA-F0-9]{40}$/.test(polyDeskEscrowContract) || /^0x0{40}$/i.test(polyDeskEscrowContract)
    || !Number.isInteger(polyDeskChainId) || polyDeskChainId < 1
  ) throw httpError('HashPayStream Upfront is not fully configured.', 503)
  return {
    apiKey, secret, storeKey, baseUrl: baseUrl.origin,
    polyDeskBaseUrl: polyDeskBaseUrl.origin, polyDeskServiceToken, polyDeskSigningSecret, polyDeskSigningKeyId,
    polyDeskExpectedSigner: getAddress(polyDeskExpectedSigner), polyDeskEscrowContract: getAddress(polyDeskEscrowContract), polyDeskChainId,
  }
}

async function requestAssessment(request: AgreementIntelligenceRequest, config: { baseUrl: string; apiKey: string }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(config.baseUrl + '/api/integrations/agreement-intelligence', {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { authorization: 'Bearer ' + config.apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> }
  } catch (cause) {
    throw Object.assign(httpError('ZeroScout Agreement Intelligence is temporarily unavailable.', 503), { cause })
  } finally { clearTimeout(timer) }
}

const defaults: UpfrontAssessmentDependencies = {
  identity: verifiedIdentity,
  mutate: (key, update) => mutateDurableJson<AssessmentStore>(key, update),
  assess: requestAssessment,
  underwrite: (request, intelligence, config) => requestPolyDeskUnderwriting({ request, intelligence, ...config }),
  env: () => process.env,
  now: () => new Date(),
  requestId: (identity, idempotencyKey) => 'uai_' + createHash('sha256').update(identity + '\0' + idempotencyKey).digest('hex'),
}
function safeStore(current?: AssessmentStore): AssessmentStore { return { schema: 1, records: current?.schema === 1 && current.records ? { ...current.records } : {} } }

function safeAssessmentResponse(body: Record<string, unknown>) {
  const proof = body.proof && typeof body.proof === 'object' && !Array.isArray(body.proof) ? body.proof as Record<string, unknown> : undefined
  return {
    id: clean(body.id, 80), schema: clean(body.schema, 100), schemaVersion: clean(body.schemaVersion, 20),
    requestCommitment: clean(body.requestCommitment, 100), intelligenceProvider: clean(body.intelligenceProvider, 120),
    recommendation: clean(body.recommendation, 24), confidence: Number(body.confidence), evidenceGrade: clean(body.evidenceGrade, 24),
    deliveryClarityScore: Number(body.deliveryClarityScore), recommendedMaxAdvanceBps: Number(body.recommendedMaxAdvanceBps),
    summary: clean(body.summary, 1_200),
    riskFlags: Array.isArray(body.riskFlags) ? body.riskFlags.slice(0, 20).map(item => clean(item, 240)).filter(Boolean) : [],
    signals: Array.isArray(body.signals) ? body.signals.slice(0, 20).map(item => clean(item, 240)).filter(Boolean) : [],
    dataGaps: Array.isArray(body.dataGaps) ? body.dataGaps.slice(0, 20).map(item => clean(item, 240)).filter(Boolean) : [],
    reasonCodes: Array.isArray(body.reasonCodes) ? body.reasonCodes.slice(0, 20).map(item => clean(item, 80)).filter(Boolean) : [],
    disclaimer: clean(body.disclaimer, 500),
    proof: proof ? { storageRoot: clean(proof.storageRoot, 100), storageUri: clean(proof.storageUri, 300), contentHash: clean(proof.contentHash, 100), storageTxHash: clean(proof.storageTxHash, 100) } : undefined,
    createdAt: clean(body.createdAt, 64),
  }
}

function validAssessmentResponse(response: ReturnType<typeof safeAssessmentResponse>) {
  return Boolean(
    response.id
    && response.schema === 'zeroscout.agreement-intelligence.result'
    && response.schemaVersion === '1.0.0'
    && /^sha256:[a-f0-9]{64}$/.test(response.requestCommitment)
    && ['proceed', 'review', 'needs_evidence'].includes(response.recommendation)
    && ['standard', 'limited', 'insufficient'].includes(response.evidenceGrade)
    && Number.isInteger(response.confidence) && response.confidence >= 0 && response.confidence <= 100
    && Number.isInteger(response.deliveryClarityScore) && response.deliveryClarityScore >= 0 && response.deliveryClarityScore <= 100
    && Number.isInteger(response.recommendedMaxAdvanceBps) && response.recommendedMaxAdvanceBps >= 1_000 && response.recommendedMaxAdvanceBps <= 8_000
    && response.proof?.contentHash
  )
}

export function createHashPayStreamUpfrontAssessmentHandler(overrides: Partial<UpfrontAssessmentDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function hashPayStreamUpfrontAssessment(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    let storeKey = ''
    let replayKey = ''
    try {
      const config = configuration(dependencies.env())
      storeKey = config.storeKey
      const identity = await dependencies.identity(req)
      const draft = validateUpfrontDraft(req.body)
      const idempotencyKey = clean(req.headers['idempotency-key'], 160)
      if (idempotencyKey.length < 16) throw httpError('Idempotency-Key must contain at least 16 characters.', 400)
      const issuedAt = dependencies.now().toISOString()
      const request = buildAgreementIntelligenceRequest({ requestId: dependencies.requestId(identity, idempotencyKey), issuedAt, providerIdentity: identity, providerReferenceSecret: config.secret, draft })
      const ownerReference = request.source.providerReference
      const requestHash = agreementIntelligenceRequestHash(request)
      const payloadHash = agreementIntelligencePayloadHash(request)
      replayKey = ownerReference + ':' + idempotencyKey
      let replay: Record<string, unknown> | undefined
      await dependencies.mutate(storeKey, current => {
        const next = safeStore(current)
        const existing = next.records[replayKey]
        if (existing) {
          if (existing.ownerReference !== ownerReference) throw httpError('Upfront assessment ownership conflict.', 409)
          if (existing.requestHash !== payloadHash) throw httpError('Idempotency-Key was already used for a different Upfront request.', 409)
          if (existing.status === 'completed' && existing.response) replay = existing.response
          else throw httpError('This Upfront assessment is already processing.', 409)
          return next
        }
        next.records[replayKey] = { ownerReference, requestHash: payloadHash, status: 'pending', createdAt: issuedAt, request }
        return next
      })
      if (replay) return res.json({ ok: true, assessment: replay, replayed: true })
      const result = await dependencies.assess(request, { baseUrl: config.baseUrl, apiKey: config.apiKey })
      if (result.status < 200 || result.status >= 300) throw httpError(clean(result.body.error, 300) || 'ZeroScout rejected the Agreement Intelligence request.', result.status >= 400 && result.status < 600 ? result.status : 502)
      const response = safeAssessmentResponse(result.body)
      if (!validAssessmentResponse(response)) throw httpError('ZeroScout returned an invalid Agreement Intelligence result.', 502)
      if (response.requestCommitment !== requestHash) throw httpError('ZeroScout Agreement Intelligence does not match this request.', 502)
      const underwriting = await dependencies.underwrite(request, response, {
        baseUrl: config.polyDeskBaseUrl,
        serviceToken: config.polyDeskServiceToken,
        signingSecret: config.polyDeskSigningSecret,
        expectedKeyId: config.polyDeskSigningKeyId || undefined,
        expectedSigner: config.polyDeskExpectedSigner,
        escrowContract: config.polyDeskEscrowContract,
        chainId: config.polyDeskChainId,
        now: dependencies.now(),
      })
      const combinedAssessment = { intelligence: response, decision: underwriting }
      await dependencies.mutate(storeKey, current => {
        const next = safeStore(current)
        next.records[replayKey] = { ownerReference, requestHash: payloadHash, status: 'completed', createdAt: issuedAt, request, response: combinedAssessment }
        return next
      })
      return res.status(201).json({ ok: true, assessment: combinedAssessment, replayed: false })
    } catch (error) {
      if (storeKey && replayKey) await dependencies.mutate(storeKey, current => { const next = safeStore(current); if (next.records[replayKey]?.status === 'pending') delete next.records[replayKey]; return next }).catch(() => undefined)
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'HashPayStream Upfront is temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createHashPayStreamUpfrontAssessmentHandler()
