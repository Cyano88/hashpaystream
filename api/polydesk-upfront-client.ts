import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { getAddress, recoverTypedDataAddress, type Address, type Hex } from 'viem'
import type { AgreementIntelligenceRequest } from './agreement-intelligence-schema.js'

const UNDERWRITING_TYPES = {
  UnderwritingOffer: [
    { name: 'provider', type: 'address' },
    { name: 'termsHash', type: 'bytes32' },
    { name: 'intelligenceCommitment', type: 'bytes32' },
    { name: 'protectedAmount', type: 'uint256' },
    { name: 'maxAdvanceBps', type: 'uint16' },
    { name: 'protectionDeadline', type: 'uint48' },
    { name: 'underwritingDeadline', type: 'uint48' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

type OnchainUnderwritingOffer = {
  domain: { name: 'HashPayStream Upfront'; version: '1'; chainId: number; verifyingContract: Address }
  primaryType: 'UnderwritingOffer'
  message: {
    provider: Address; termsHash: Hex; intelligenceCommitment: Hex; protectedAmount: string
    maxAdvanceBps: number; protectionDeadline: number; underwritingDeadline: number; nonce: Hex
  }
  signer: Address
  signature: Hex
}

type ZeroScoutAssessment = {
  schema: string
  schemaVersion: string
  requestCommitment: string
  recommendation: string
  confidence: number
  evidenceGrade: string
  deliveryClarityScore: number
  recommendedMaxAdvanceBps: number
  reasonCodes: string[]
  proof?: { contentHash?: string }
}

export type PolyDeskDecision = {
  schema: 'polydesk.upfront.underwriting.decision'
  schemaVersion: '1.0.0'
  policyVersion: string
  decisionId: string
  requestId: string
  issuedAt: string
  expiresAt: string
  termsHash: string
  intelligenceCommitment: string
  proofContentHash: string
  decision: 'APPROVE' | 'ESCALATE' | 'BLOCK'
  maximumAdvanceBps: number
  reasonCodes: string[]
  humanReviewRequired: boolean
  disclaimer: string
  onchainOffer?: OnchainUnderwritingOffer
  attestation: {
    algorithm: 'hmac-sha256'
    keyId: string
    payloadHash: string
    signature: string
  }
}

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function httpError(message: string, status: number) { return Object.assign(new Error(message), { status }) }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function sameHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export function buildPolyDeskUnderwritingRequest(request: AgreementIntelligenceRequest, intelligence: ZeroScoutAssessment) {
  const proofContentHash = clean(intelligence.proof?.contentHash, 100)
  if (!/^(?:0x|sha256:)[a-f0-9]{64}$/.test(proofContentHash)) throw httpError('ZeroScout proof cannot be used for underwriting.', 502)
  return {
    schema: 'polydesk.upfront.underwriting.request',
    schemaVersion: '1.0.0',
    requestId: request.requestId,
    issuedAt: request.issuedAt,
    agreement: {
      termsHash: request.agreement.termsHash,
      providerPayoutAddress: request.advance.providerPayoutAddress,
      amountUsdcUnits: request.agreement.amountUsdcUnits,
      requestedAdvanceBps: request.advance.requestedBps,
      requestedAdvanceUsdcUnits: request.advance.requestedUsdcUnits,
    },
    intelligence: {
      schema: intelligence.schema,
      schemaVersion: intelligence.schemaVersion,
      requestCommitment: intelligence.requestCommitment,
      recommendation: intelligence.recommendation,
      confidence: intelligence.confidence,
      evidenceGrade: intelligence.evidenceGrade,
      deliveryClarityScore: intelligence.deliveryClarityScore,
      recommendedMaxAdvanceBps: intelligence.recommendedMaxAdvanceBps,
      reasonCodes: intelligence.reasonCodes,
      proofContentHash,
    },
  }
}

export async function verifyPolyDeskDecision(value: unknown, input: {
  request: AgreementIntelligenceRequest
  intelligence: ZeroScoutAssessment
  signingSecret: string
  expectedKeyId?: string
  expectedSigner: Address
  escrowContract: Address
  chainId: number
  now: Date
}): Promise<PolyDeskDecision> {
  const envelope = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const raw = envelope.decision && typeof envelope.decision === 'object' && !Array.isArray(envelope.decision) ? envelope.decision as Record<string, unknown> : {}
  const attestationRaw = raw.attestation && typeof raw.attestation === 'object' && !Array.isArray(raw.attestation) ? raw.attestation as Record<string, unknown> : {}
  const offerRaw = raw.onchainOffer && typeof raw.onchainOffer === 'object' && !Array.isArray(raw.onchainOffer) ? raw.onchainOffer as Record<string, unknown> : undefined
  const domainRaw = offerRaw?.domain && typeof offerRaw.domain === 'object' && !Array.isArray(offerRaw.domain) ? offerRaw.domain as Record<string, unknown> : {}
  const messageRaw = offerRaw?.message && typeof offerRaw.message === 'object' && !Array.isArray(offerRaw.message) ? offerRaw.message as Record<string, unknown> : {}
  const onchainOffer = offerRaw ? {
    domain: {
      name: clean(domainRaw.name, 80), version: clean(domainRaw.version, 20), chainId: Number(domainRaw.chainId),
      verifyingContract: clean(domainRaw.verifyingContract, 42),
    },
    primaryType: clean(offerRaw.primaryType, 40),
    message: {
      provider: clean(messageRaw.provider, 42), termsHash: clean(messageRaw.termsHash, 66),
      intelligenceCommitment: clean(messageRaw.intelligenceCommitment, 66), protectedAmount: clean(messageRaw.protectedAmount, 32),
      maxAdvanceBps: Number(messageRaw.maxAdvanceBps), protectionDeadline: Number(messageRaw.protectionDeadline),
      underwritingDeadline: Number(messageRaw.underwritingDeadline), nonce: clean(messageRaw.nonce, 66),
    },
    signer: clean(offerRaw.signer, 42), signature: clean(offerRaw.signature, 132),
  } : undefined
  const decision = {
    schema: clean(raw.schema, 100),
    schemaVersion: clean(raw.schemaVersion, 20),
    policyVersion: clean(raw.policyVersion, 80),
    decisionId: clean(raw.decisionId, 80),
    requestId: clean(raw.requestId, 100),
    issuedAt: clean(raw.issuedAt, 64),
    expiresAt: clean(raw.expiresAt, 64),
    termsHash: clean(raw.termsHash, 100),
    intelligenceCommitment: clean(raw.intelligenceCommitment, 100),
    proofContentHash: clean(raw.proofContentHash, 100),
    decision: clean(raw.decision, 20),
    maximumAdvanceBps: Number(raw.maximumAdvanceBps),
    reasonCodes: Array.isArray(raw.reasonCodes) ? raw.reasonCodes.slice(0, 30).map(item => clean(item, 80)).filter(Boolean) : [],
    humanReviewRequired: raw.humanReviewRequired,
    disclaimer: clean(raw.disclaimer, 500),
    ...(onchainOffer ? { onchainOffer } : {}),
  }
  const attestation = {
    algorithm: clean(attestationRaw.algorithm, 40),
    keyId: clean(attestationRaw.keyId, 80),
    payloadHash: clean(attestationRaw.payloadHash, 100),
    signature: clean(attestationRaw.signature, 100),
  }
  if (
    decision.schema !== 'polydesk.upfront.underwriting.decision'
    || decision.schemaVersion !== '1.0.0'
    || !['APPROVE', 'ESCALATE', 'BLOCK'].includes(decision.decision)
    || !Number.isInteger(decision.maximumAdvanceBps) || decision.maximumAdvanceBps < 0 || decision.maximumAdvanceBps > 8_000
    || typeof decision.humanReviewRequired !== 'boolean'
    || attestation.algorithm !== 'hmac-sha256'
  ) throw httpError('PolyDesk returned an invalid underwriting decision.', 502)
  if (
    decision.requestId !== input.request.requestId
    || decision.termsHash !== input.request.agreement.termsHash
    || decision.intelligenceCommitment !== input.intelligence.requestCommitment
    || decision.proofContentHash !== input.intelligence.proof?.contentHash
  ) throw httpError('PolyDesk underwriting decision does not match this agreement.', 502)
  if (input.expectedKeyId && attestation.keyId !== input.expectedKeyId) throw httpError('PolyDesk underwriting signing key is unexpected.', 502)
  const expiresAt = new Date(decision.expiresAt).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) throw httpError('PolyDesk underwriting decision has expired.', 502)
  if (decision.decision === 'APPROVE') {
    const offer = decision.onchainOffer
    const expectedTermsHash = '0x' + input.request.agreement.termsHash.slice(7)
    const expectedCommitment = '0x' + input.intelligence.requestCommitment.slice(7)
    if (
      !offer
      || offer.domain.name !== 'HashPayStream Upfront' || offer.domain.version !== '1'
      || offer.domain.chainId !== input.chainId
      || !/^0x[a-fA-F0-9]{40}$/.test(offer.domain.verifyingContract)
      || getAddress(offer.domain.verifyingContract) !== getAddress(input.escrowContract)
      || offer.primaryType !== 'UnderwritingOffer'
      || !/^0x[a-fA-F0-9]{40}$/.test(offer.message.provider)
      || getAddress(offer.message.provider) !== getAddress(input.request.advance.providerPayoutAddress)
      || offer.message.termsHash.toLowerCase() !== expectedTermsHash.toLowerCase()
      || offer.message.intelligenceCommitment.toLowerCase() !== expectedCommitment.toLowerCase()
      || offer.message.protectedAmount !== input.request.agreement.amountUsdcUnits
      || offer.message.maxAdvanceBps !== decision.maximumAdvanceBps
      || !Number.isInteger(offer.message.protectionDeadline) || offer.message.protectionDeadline <= offer.message.underwritingDeadline
      || !Number.isInteger(offer.message.underwritingDeadline) || offer.message.underwritingDeadline * 1_000 !== expiresAt
      || !/^0x[a-fA-F0-9]{64}$/.test(offer.message.nonce)
      || !/^0x[a-fA-F0-9]{130}$/.test(offer.signature)
      || !/^0x[a-fA-F0-9]{40}$/.test(offer.signer)
      || getAddress(offer.signer) !== getAddress(input.expectedSigner)
    ) throw httpError('PolyDesk returned an invalid onchain underwriting offer.', 502)
    const recovered = await recoverTypedDataAddress({
      domain: { ...offer.domain, verifyingContract: getAddress(offer.domain.verifyingContract) },
      types: UNDERWRITING_TYPES,
      primaryType: 'UnderwritingOffer',
      message: {
        ...offer.message,
        provider: getAddress(offer.message.provider),
        termsHash: offer.message.termsHash as Hex,
        intelligenceCommitment: offer.message.intelligenceCommitment as Hex,
        protectedAmount: BigInt(offer.message.protectedAmount),
        nonce: offer.message.nonce as Hex,
      },
      signature: offer.signature as Hex,
    })
    if (getAddress(recovered) !== getAddress(input.expectedSigner)) throw httpError('PolyDesk onchain underwriting signature is invalid.', 502)
  }
  const payloadHash = createHash('sha256').update(canonical(decision)).digest('hex')
  const expectedSignature = createHmac('sha256', input.signingSecret).update(payloadHash).digest('hex')
  if (attestation.payloadHash !== 'sha256:' + payloadHash || !sameHex(attestation.signature, expectedSignature)) {
    throw httpError('PolyDesk underwriting attestation is invalid.', 502)
  }
  return { ...decision, attestation } as PolyDeskDecision
}

export async function requestPolyDeskUnderwriting(input: {
  request: AgreementIntelligenceRequest
  intelligence: ZeroScoutAssessment
  baseUrl: string
  serviceToken: string
  signingSecret: string
  expectedKeyId?: string
  expectedSigner: Address
  escrowContract: Address
  chainId: number
  now: Date
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(input.baseUrl + '/api/upfront/v1/underwrite', {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { authorization: 'Bearer ' + input.serviceToken, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(buildPolyDeskUnderwritingRequest(input.request, input.intelligence)),
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw httpError(clean(body.error, 300) || 'PolyDesk rejected the underwriting request.', response.status)
    return verifyPolyDeskDecision(body, input)
  } catch (cause) {
    if (typeof (cause as { status?: unknown })?.status === 'number') throw cause
    throw Object.assign(httpError('PolyDesk Upfront underwriting is temporarily unavailable.', 503), { cause })
  } finally { clearTimeout(timer) }
}
