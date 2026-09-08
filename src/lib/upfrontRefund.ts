import { getAddress, type Address } from 'viem'
export const REFUND_POSITION_ABI = [{ type: 'function', name: 'positions', stateMutability: 'view', inputs: [{ name: 'positionId', type: 'bytes32' }], outputs: [
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' }, { name: 'provider', type: 'address' },
  { name: 'providerArcRecipient', type: 'address' }, { name: 'platformTreasury', type: 'address' }, { name: 'protectionSigner', type: 'address' },
  { name: 'termsHash', type: 'bytes32' }, { name: 'fundingTermsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' },
  { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' }, { name: 'advanceAmount', type: 'uint256' },
  { name: 'funderRepaymentAmount', type: 'uint256' }, { name: 'platformFeeAmount', type: 'uint256' }, { name: 'protectionDeadline', type: 'uint48' }, { name: 'status', type: 'uint8' },
] }] as const
export function refundEligibility(position: readonly unknown[], wallet: Address, blockTimestamp: bigint) {
  const deadline = BigInt(String(position[14]))
  const funded = Number(position[15]) === 1
  const isFunder = getAddress(String(position[0])) === getAddress(wallet)
  return { deadline, funded, isFunder, ready: funded && isFunder && blockTimestamp > deadline }
}