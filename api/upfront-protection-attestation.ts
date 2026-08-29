import { getAddress, keccak256, toBytes, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { AgreementIntelligenceRequest } from './agreement-intelligence-schema.js'
import { agreementIntelligenceRequestHash } from './agreement-intelligence-schema.js'
import { hasMinimumUpfrontProtectionWindow } from './early-pay-timing-policy.js'

export const PROTECTION_TYPES = {
  ProtectionAttestation: [
    { name: 'positionId', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
    { name: 'arcTermsHash', type: 'bytes32' }, { name: 'termsHash', type: 'bytes32' },
    { name: 'arcRecipient', type: 'address' }, { name: 'funder', type: 'address' },
    { name: 'repaymentRecipient', type: 'address' },
    { name: 'provider', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
    { name: 'advanceAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' },
    { name: 'deadline', type: 'uint48' },
  ],
} as const

export const REPAYMENT_TYPES = {
  SplitSettlement: [
    { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'arcTermsHash', type: 'bytes32' },
    { name: 'funder', type: 'address' }, { name: 'provider', type: 'address' },
    { name: 'funderAmount', type: 'uint256' }, { name: 'providerAmount', type: 'uint256' },
    { name: 'observedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
  ],
} as const

export type UpfrontPosition = {
  positionId: Hex; funder: Address; repaymentRecipient: Address; provider: Address; termsHash: Hex
  intelligenceCommitment: Hex
  protectedAmount: string; advanceAmount: string; protectionDeadline: number; status: 'Funded' | 'Released' | 'Refunded'
}

export type AuthoritativeArcAgreement = {
  id: string; status: string; template: string; title: string; description: string; amount: string
  recipient: Address; durationSeconds: number; cancellationWindowSeconds: number
  chain: null | {
    network: string; chainId: number; onchainAgreementId: Hex; termsHash: Hex
    amountUsdcUnits: string; releasedUsdcUnits: string; remainingUsdcUnits: string
    expiresAt: string
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
  const arcProtectionDeadline = Number(agreement.chain.expiresAt)
  if (!Number.isSafeInteger(request.agreement.protectionDeadline) || position.protectionDeadline !== request.agreement.protectionDeadline || arcProtectionDeadline !== request.agreement.protectionDeadline) invalid('X Layer protection deadline does not match the Arc agreement expiry.')
  return agreement.chain
}

export async function signProtectionAttestation(input: {
  request: AgreementIntelligenceRequest; position: UpfrontPosition; agreement: AuthoritativeArcAgreement
  arcRouter: Address; xLayerChainId: number; xLayerEscrow: Address; privateKey: Hex; now: Date; minimumRemainingSeconds: number
}) {
  const chain = assertBinding(input)
  if (input.position.status !== 'Funded' || input.agreement.status !== 'active') invalid('Advance release requires a funded X Layer position and active Arc protection.')
  const observedAt = Math.floor(input.now.getTime() / 1000)
  if (!hasMinimumUpfrontProtectionWindow(input.position.protectionDeadline, input.now, input.minimumRemainingSeconds)) invalid('Early pay requires more time remaining before the agreement ends.')
  const deadline = Math.min(input.position.protectionDeadline, observedAt + 600)
  if (!Number.isSafeInteger(observedAt) || deadline <= observedAt) invalid('The protection attestation window has expired.')
  const message = {
    positionId: input.position.positionId, arcAgreementHash: chain.onchainAgreementId,
    arcTermsHash: chain.termsHash, termsHash: input.position.termsHash, arcRecipient: getAddress(input.arcRouter),
    funder: getAddress(input.position.funder), repaymentRecipient: getAddress(input.position.repaymentRecipient),
    provider: getAddress(input.position.provider),
    protectedAmount: BigInt(input.position.protectedAmount), advanceAmount: BigInt(input.position.advanceAmount),
    observedAt, deadline,
  }
  const account = privateKeyToAccount(input.privateKey)
  const domain = { name: 'HashPayStream Upfront', version: '1', chainId: input.xLayerChainId, verifyingContract: getAddress(input.xLayerEscrow) } as const
  return { domain, primaryType: 'ProtectionAttestation' as const, message: { ...message, protectedAmount: message.protectedAmount.toString(), advanceAmount: message.advanceAmount.toString() }, signer: account.address, signature: await account.signTypedData({ domain, types: PROTECTION_TYPES, primaryType: 'ProtectionAttestation', message }) }
}

export async function signSplitSettlement(input: {
  request: AgreementIntelligenceRequest; position: UpfrontPosition; agreement: AuthoritativeArcAgreement
  arcRouter: Address; privateKey: Hex; now: Date
}) {
  const chain = assertBinding(input)
  if (input.position.status !== 'Released' || input.agreement.status !== 'completed') invalid('Repayment credit requires a released advance and completed Arc agreement.')
  if (chain.releasedUsdcUnits !== input.position.protectedAmount || chain.remainingUsdcUnits !== '0') invalid('Arc repayment is not complete.')
  const protectedAmount = BigInt(input.position.protectedAmount)
  const funderAmount = BigInt(input.position.advanceAmount)
  if (funderAmount <= 0n || funderAmount >= protectedAmount) invalid('The protected payment cannot be split safely.')
  const providerAmount = protectedAmount - funderAmount
  const funder = getAddress(input.position.repaymentRecipient)
  const provider = getAddress(input.request.settlement.providerRecipient)
  if (funder === provider) invalid('The repayment and provider wallets must be different.')
  const observedAt = Math.floor(input.now.getTime() / 1000)
  const deadline = observedAt + 600
  const message = {
    arcAgreementHash: chain.onchainAgreementId, arcTermsHash: chain.termsHash,
    funder, provider,
    funderAmount, providerAmount, observedAt, deadline,
  }
  const account = privateKeyToAccount(input.privateKey)
  const domain = { name: 'HashPayStream Upfront Repayment', version: '2', chainId: 5_042_002, verifyingContract: getAddress(input.arcRouter) } as const
  return {
    domain,
    primaryType: 'SplitSettlement' as const,
    message: { ...message, funderAmount: message.funderAmount.toString(), providerAmount: message.providerAmount.toString() },
    signer: account.address,
    signature: await account.signTypedData({ domain, types: REPAYMENT_TYPES, primaryType: 'SplitSettlement', message }),
  }
}
