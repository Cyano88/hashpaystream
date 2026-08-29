import { getAddress, hashTypedData, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { quoteUpfrontFees, type UpfrontFeeQuote } from './upfront-fees.js'

export const FUNDING_TERMS_TYPES = {
  FundingTerms: [
    { name: 'offerHash', type: 'bytes32' },
    { name: 'funder', type: 'address' },
    { name: 'repaymentRecipient', type: 'address' },
    { name: 'providerArcRecipient', type: 'address' },
    { name: 'platformTreasury', type: 'address' },
    { name: 'advanceAmount', type: 'uint256' },
    { name: 'funderRepaymentAmount', type: 'uint256' },
    { name: 'platformFeeAmount', type: 'uint256' },
    { name: 'deadline', type: 'uint48' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

export type SignedFundingTerms = {
  domain: { name: 'HashPayStream Upfront'; version: '1'; chainId: number; verifyingContract: Address }
  primaryType: 'FundingTerms'
  message: {
    offerHash: Hex
    funder: Address
    repaymentRecipient: Address
    providerArcRecipient: Address
    platformTreasury: Address
    advanceAmount: string
    funderRepaymentAmount: string
    platformFeeAmount: string
    deadline: number
    nonce: Hex
  }
  signer: Address
  signature: Hex
  quote: UpfrontFeeQuote
}

export async function signFundingTerms(input: {
  offerHash: Hex
  funder: Address
  providerArcRecipient: Address
  platformTreasury: Address
  advanceAmount: bigint
  protectedAmount: bigint
  durationSeconds: number
  deadline: number
  nonce: Hex
  chainId: number
  escrow: Address
  privateKey: Hex
}): Promise<SignedFundingTerms> {
  const quote = quoteUpfrontFees({ protectedAmount: input.protectedAmount, advanceAmount: input.advanceAmount, durationSeconds: input.durationSeconds })
  const domain = { name: 'HashPayStream Upfront', version: '1', chainId: input.chainId, verifyingContract: getAddress(input.escrow) } as const
  const message = {
    offerHash: input.offerHash,
    funder: getAddress(input.funder),
    repaymentRecipient: getAddress(input.funder),
    providerArcRecipient: getAddress(input.providerArcRecipient),
    platformTreasury: getAddress(input.platformTreasury),
    advanceAmount: input.advanceAmount,
    funderRepaymentAmount: BigInt(quote.funderRepaymentUsdcUnits),
    platformFeeAmount: BigInt(quote.platformFeeUsdcUnits),
    deadline: input.deadline,
    nonce: input.nonce,
  }
  const account = privateKeyToAccount(input.privateKey)
  const signature = await account.signTypedData({ domain, types: FUNDING_TERMS_TYPES, primaryType: 'FundingTerms', message })
  return {
    domain,
    primaryType: 'FundingTerms',
    message: {
      ...message,
      advanceAmount: message.advanceAmount.toString(),
      funderRepaymentAmount: message.funderRepaymentAmount.toString(),
      platformFeeAmount: message.platformFeeAmount.toString(),
    },
    signer: account.address,
    signature,
    quote,
  }
}

export function fundingTermsHash(terms: SignedFundingTerms) {
  return hashTypedData({
    domain: terms.domain,
    types: FUNDING_TERMS_TYPES,
    primaryType: 'FundingTerms',
    message: {
      ...terms.message,
      advanceAmount: BigInt(terms.message.advanceAmount),
      funderRepaymentAmount: BigInt(terms.message.funderRepaymentAmount),
      platformFeeAmount: BigInt(terms.message.platformFeeAmount),
    },
  })
}
