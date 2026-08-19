import { getAddress, keccak256, toBytes, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { AgreementIntelligenceRequest } from './agreement-intelligence-schema.js'
import { agreementIntelligenceRequestHash } from './agreement-intelligence-schema.js'

export const PROTECTION_TYPES = {
  ProtectionAttestation: [
    { name: 'positionId', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
    { name: 'arcTermsHash', type: 'bytes32' }, { name: 'termsHash', type: 'bytes32' },
    { name: 'arcRecipient', type: 'address' }, { name: 'funder', type: 'address' },
    { name: 'provider', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
    { name: 'advanceAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' },
    { name: 'deadline', type: 'uint48' },
  ],
} as const

export const REPAYMENT_TYPES = {
  RepaymentCredit: [
    { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'arcTermsHash', type: 'bytes32' },
    { name: 'funder', type: 'address' }, { name: 'amount', type: 'uint256' },
    { name: 'observedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
  ],
} as const

export type UpfrontPosition = {
  positionId: Hex; funder: Address; provider: Address; termsHash: Hex
  intelligenceCommitment: Hex
  protectedAmount: string; advanceAmount: string; protectionDeadline: number; status: 'Funded' | 'Released' | 'Refunded'
}

export type AuthoritativeArcAgreement = {
  id: string; status: string; template: string; title: string; description: string; amount: string
  recipient: Address; durationSeconds: number; cancellationWindowSeconds: number
  chain: null | {
    network: string; chainId: number; onchainAgreementId: Hex; termsHash: Hex
    amountUsdcUnits: string; releasedUsdcUnits: string; remainingUsdcUnits: string
  }
}

function invalid(message: string): never { throw Object.assign(new Error(message), { status: 409 }) }
function units(value: unknown) { const text = String(value ?? ''); if (!/^\d{1,40}$/.test(text)) invalid('Agreement amount units are invalid.'); return text }
function positive(value: string) { return BigInt(units(value)) > 0n }
function sameAddress(left: string, right: string) { return getAddress(left) === getAddress(right) }
function sameText(left: unknown, right: unknown) { return String(left ?? '').replace(/\s+/g, ' ').trim() === String(right ?? '').replace(/\s+/g, ' ').trim() }

function assertBinding(input: {
  request: AgreementIntelligenceRequest; position: UpfrontPosition; agreement: AuthoritativeArcAgreement; arcRouter: Address
}) {
  const { request, position, agreement } = input
  if (!/^agr_[a-z0-9]{12,64}$/i.test(agreement.id)) invalid('Arc agreement identity is invalid.')
  if (position.status === 'Refunded') invalid('The X Layer advance has already been refunded.')
  if (!sameAddress(position.provider, request.advance.providerPayoutAddress)) invalid('X Layer provider does not match the assessed agreement.')
  if (position.termsHash.toLowerCase() !== ('0x' + request.agreement.termsHash.slice(7)).toLowerCase()) invalid('X Layer terms commitment does not match the assessed agreement.')
  if (position.intelligenceCommitment.toLowerCase() !== ('0x' + agreementIntelligenceRequestHash(request).slice(7)).toLowerCase()) invalid('X Layer intelligence commitment does not match the assessment.')
  if (position.protectedAmount !== request.agreement.amountUsdcUnits) invalid('X Layer protected amount does not match the assessed agreement.')
  if (
    agreement.template !== 'fixed_unlock' || request.agreement.template !== 'fixed_unlock'
    || !sameText(agreement.title, request.agreement.title)
    || !sameText(agreement.description, request.agreement.deliveryDescription)
    || agreement.durationSeconds !== request.agreement.durationSeconds
    || agreement.cancellationWindowSeconds !== request.agreement.cancellationWindowSeconds
  ) invalid('Arc agreement terms do not match the assessed draft.')
  if (!sameAddress(agreement.recipient, input.arcRouter)) invalid('Arc agreement recipient is not the configured repayment router.')
  if (!agreement.chain || agreement.chain.network !== 'arc' || agreement.chain.chainId !== 5_042_002) invalid('Arc agreement has no authoritative testnet chain state.')
  if (!/^0x[a-fA-F0-9]{64}$/.test(agreement.chain.onchainAgreementId) || !/^0x[a-fA-F0-9]{64}$/.test(agreement.chain.termsHash)) invalid('Arc agreement chain commitment is invalid.')
  if (agreement.chain.amountUsdcUnits !== position.protectedAmount || !positive(agreement.chain.amountUsdcUnits)) invalid('Arc protected amount does not match the X Layer position.')
  return agreement.chain
}

export async function signProtectionAttestation(input: {
  request: AgreementIntelligenceRequest; position: UpfrontPosition; agreement: AuthoritativeArcAgreement
  arcRouter: Address; xLayerChainId: number; xLayerEscrow: Address; privateKey: Hex; now: Date
}) {
  const chain = assertBinding(input)
  if (input.position.status !== 'Funded' || input.agreement.status !== 'active') invalid('Advance release requires a funded X Layer position and active Arc protection.')
  const observedAt = Math.floor(input.now.getTime() / 1000)
  const deadline = Math.min(input.position.protectionDeadline, observedAt + 600)
  if (!Number.isSafeInteger(observedAt) || deadline <= observedAt) invalid('The protection attestation window has expired.')
  const message = {
    positionId: input.position.positionId, arcAgreementHash: chain.onchainAgreementId,
    arcTermsHash: chain.termsHash, termsHash: input.position.termsHash, arcRecipient: getAddress(input.arcRouter),
    funder: getAddress(input.position.funder), provider: getAddress(input.position.provider),
    protectedAmount: BigInt(input.position.protectedAmount), advanceAmount: BigInt(input.position.advanceAmount),
    observedAt, deadline,
  }
  const account = privateKeyToAccount(input.privateKey)
  const domain = { name: 'HashPayStream Upfront', version: '1', chainId: input.xLayerChainId, verifyingContract: getAddress(input.xLayerEscrow) } as const
  return { domain, primaryType: 'ProtectionAttestation' as const, message: { ...message, protectedAmount: message.protectedAmount.toString(), advanceAmount: message.advanceAmount.toString() }, signer: account.address, signature: await account.signTypedData({ domain, types: PROTECTION_TYPES, primaryType: 'ProtectionAttestation', message }) }
}

export async function signRepaymentCredit(input: {
  request: AgreementIntelligenceRequest; position: UpfrontPosition; agreement: AuthoritativeArcAgreement
  arcRouter: Address; privateKey: Hex; now: Date
}) {
  const chain = assertBinding(input)
  if (input.position.status !== 'Released' || input.agreement.status !== 'completed') invalid('Repayment credit requires a released advance and completed Arc agreement.')
  if (chain.releasedUsdcUnits !== input.position.protectedAmount || chain.remainingUsdcUnits !== '0') invalid('Arc repayment is not complete.')
  const observedAt = Math.floor(input.now.getTime() / 1000)
  const deadline = observedAt + 600
  const message = {
    arcAgreementHash: chain.onchainAgreementId, arcTermsHash: chain.termsHash,
    funder: getAddress(input.position.funder), amount: BigInt(input.position.protectedAmount), observedAt, deadline,
  }
  const account = privateKeyToAccount(input.privateKey)
  const domain = { name: 'HashPayStream Upfront Repayment', version: '1', chainId: 5_042_002, verifyingContract: getAddress(input.arcRouter) } as const
  return { domain, primaryType: 'RepaymentCredit' as const, message: { ...message, amount: message.amount.toString() }, signer: account.address, signature: await account.signTypedData({ domain, types: REPAYMENT_TYPES, primaryType: 'RepaymentCredit', message }) }
}
