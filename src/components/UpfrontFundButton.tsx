import { useRef, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hex,
} from 'viem'
import { upfrontXLayerChain } from '../lib/upfrontChains'

type Opportunity = {
  id: string
  providerPayoutAddress: string
  requestedAdvanceUsdcUnits: string
  onchainOffer: Record<string, unknown>
  fundingTerms?: Record<string, unknown>
  providerSignature?: string
}

type SignedOffer = {
  escrow: Address
  signature: Hex
  message: {
    provider: Address
    termsHash: Hex
    intelligenceCommitment: Hex
    protectedAmount: bigint
    maxAdvanceBps: number
    protectionDeadline: number
    underwritingDeadline: number
    nonce: Hex
  }
}

const EXPECTED_ESCROW = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS ?? '').trim()
const NATIVE_XLAYER_USDC = getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061')
const MIN_REMAINING_PROTECTION_SECONDS = 21_600
const BYTES32 = /^0x[a-fA-F0-9]{64}$/
const SIGNATURE = /^0x[a-fA-F0-9]{130}$/

class FundingUiError extends Error {}

function fundingError(reason: unknown) {
  if (reason instanceof FundingUiError) return reason.message
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  const code = typeof reason === 'object' && reason !== null && 'code' in reason
    ? String((reason as { code?: unknown }).code ?? '')
    : ''
  const rejected = ['user rejected', 'user denied', 'rejected the request', 'request rejected']
    .some(text => message.toLowerCase().includes(text))
  if (code === '4001' || rejected) return 'Transaction cancelled. No funds moved.'
  return 'The early payment could not be sent. No funds moved. Try again.'
}

const ESCROW_ABI = [
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowedFunders', stateMutability: 'view', inputs: [{ name: 'funder', type: 'address' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'fundAdvance',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'offer',
        type: 'tuple',
        components: [
          { name: 'provider', type: 'address' },
          { name: 'termsHash', type: 'bytes32' },
          { name: 'intelligenceCommitment', type: 'bytes32' },
          { name: 'protectedAmount', type: 'uint256' },
          { name: 'maxAdvanceBps', type: 'uint16' },
          { name: 'protectionDeadline', type: 'uint48' },
          { name: 'underwritingDeadline', type: 'uint48' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      {
        name: 'fundingTerms',
        type: 'tuple',
        components: [
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
      },
      { name: 'underwritingSignature', type: 'bytes' },
      { name: 'fundingTermsSignature', type: 'bytes' },
      { name: 'providerSignature', type: 'bytes' },
    ],
    outputs: [{ name: 'positionId', type: 'bytes32' }],
  },
] as const

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

function integer(value: unknown, label: string) {
  const text = String(value ?? '')
  if (!/^\d+$/.test(text)) throw new Error(`${label} is invalid.`)
  return BigInt(text)
}

function unix(value: unknown, label: string) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} is invalid.`)
  return number
}

function parseOffer(opportunity: Opportunity): SignedOffer {
  const signed = opportunity.onchainOffer
  const domain = signed.domain as Record<string, unknown> | undefined
  const raw = signed.message as Record<string, unknown> | undefined
  if (signed.primaryType !== 'UnderwritingOffer' || !domain || !raw) throw new Error('The verified underwriting offer is incomplete.')
  if (domain.name !== 'HashPayStream Upfront' || domain.version !== '1' || Number(domain.chainId) !== upfrontXLayerChain.id) {
    throw new Error('The underwriting offer targets a different network or protocol.')
  }
  if (!isAddress(String(domain.verifyingContract ?? '')) || !isAddress(EXPECTED_ESCROW)) throw new Error('The configured escrow is invalid.')
  const escrow = getAddress(String(domain.verifyingContract))
  if (escrow !== getAddress(EXPECTED_ESCROW)) throw new Error('The underwriting offer targets an unexpected escrow.')
  if (!isAddress(String(raw.provider ?? ''))) throw new Error('The provider address is invalid.')
  const termsHash = String(raw.termsHash ?? '')
  const intelligenceCommitment = String(raw.intelligenceCommitment ?? '')
  const nonce = String(raw.nonce ?? '')
  const signature = String(signed.signature ?? '')
  if (!BYTES32.test(termsHash) || !BYTES32.test(intelligenceCommitment) || !BYTES32.test(nonce) || !SIGNATURE.test(signature)) {
    throw new Error('The signed underwriting proof is invalid.')
  }
  const maxAdvanceBps = Number(raw.maxAdvanceBps)
  if (!Number.isInteger(maxAdvanceBps) || maxAdvanceBps < 1_000 || maxAdvanceBps > 8_000) throw new Error('The signed advance rate is invalid.')
  return {
    escrow,
    signature: signature as Hex,
    message: {
      provider: getAddress(String(raw.provider)),
      termsHash: termsHash as Hex,
      intelligenceCommitment: intelligenceCommitment as Hex,
      protectedAmount: integer(raw.protectedAmount, 'Protected amount'),
      maxAdvanceBps,
      protectionDeadline: unix(raw.protectionDeadline, 'Protection deadline'),
      underwritingDeadline: unix(raw.underwritingDeadline, 'Underwriting deadline'),
      nonce: nonce as Hex,
    },
  }
}

function parseFundingTerms(opportunity: Opportunity, escrow: Address) {
  const signed = opportunity.fundingTerms
  const domain = signed?.domain as Record<string, unknown> | undefined
  const raw = signed?.message as Record<string, unknown> | undefined
  const signature = String(signed?.signature ?? '')
  const providerSignature = String(opportunity.providerSignature ?? '')
  if (signed?.primaryType !== 'FundingTerms' || !domain || !raw || !SIGNATURE.test(signature) || !SIGNATURE.test(providerSignature)) {
    throw new Error('The accepted funding terms are incomplete.')
  }
  if (domain.name !== 'HashPayStream Upfront' || domain.version !== '1' || Number(domain.chainId) !== upfrontXLayerChain.id || !isAddress(String(domain.verifyingContract ?? '')) || getAddress(String(domain.verifyingContract)) !== escrow) {
    throw new Error('The accepted funding terms target a different contract.')
  }
  const offerHash = String(raw.offerHash ?? '')
  const nonce = String(raw.nonce ?? '')
  if (!BYTES32.test(offerHash) || !BYTES32.test(nonce) || !isAddress(String(raw.funder ?? '')) || !isAddress(String(raw.repaymentRecipient ?? '')) || !isAddress(String(raw.providerArcRecipient ?? '')) || !isAddress(String(raw.platformTreasury ?? ''))) {
    throw new Error('The accepted funding terms are invalid.')
  }
  return {
    message: {
      offerHash: offerHash as Hex,
      funder: getAddress(String(raw.funder)),
      repaymentRecipient: getAddress(String(raw.repaymentRecipient)),
      providerArcRecipient: getAddress(String(raw.providerArcRecipient)),
      platformTreasury: getAddress(String(raw.platformTreasury)),
      advanceAmount: integer(raw.advanceAmount, 'Advance amount'),
      funderRepaymentAmount: integer(raw.funderRepaymentAmount, 'Funding repayment'),
      platformFeeAmount: integer(raw.platformFeeAmount, 'Platform fee'),
      deadline: unix(raw.deadline, 'Funding terms deadline'),
      nonce: nonce as Hex,
    },
    signature: signature as Hex,
    providerSignature: providerSignature as Hex,
  }
}

export default function UpfrontFundButton({ opportunity, onFunded }: { opportunity: Opportunity; onFunded?: () => Promise<void> | void }) {
  const { wallets } = useWallets()
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [fundingHash, setFundingHash] = useState('')
  const actionPending = useRef(false)
  const embedded = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
  const signer = embedded.length === 1 ? embedded[0] : undefined
  const amount = integer(opportunity.requestedAdvanceUsdcUnits, 'Advance amount')
  const amountLabel = `${Number(amount) / 1_000_000} USDC`
  const busy = Boolean(stage) && !fundingHash

  async function fund() {
    if (actionPending.current) return
    actionPending.current = true
    setError('')
    setFundingHash('')
    try {
      if (!signer) throw new FundingUiError('Your funding wallet is still connecting. Return to Earn and open this request again.')
      const offer = parseOffer(opportunity)
      const fundingTerms = parseFundingTerms(opportunity, offer.escrow)
      if (!isAddress(opportunity.providerPayoutAddress) || getAddress(opportunity.providerPayoutAddress) !== offer.message.provider) {
        throw new Error('The displayed payout address does not match the signed underwriting offer.')
      }
      const account = getAddress(signer.address)
      if (fundingTerms.message.funder !== account || fundingTerms.message.repaymentRecipient !== account) throw new Error('These funding terms belong to another funding wallet.')
      if (fundingTerms.message.advanceAmount !== amount || fundingTerms.message.funderRepaymentAmount <= amount || fundingTerms.message.platformFeeAmount <= 0n) throw new Error('The displayed amounts do not match the accepted funding terms.')
      if (amount <= 0n || amount > offer.message.protectedAmount * BigInt(offer.message.maxAdvanceBps) / 10_000n) {
        throw new Error('The requested advance exceeds the signed PolyDesk limit.')
      }
      if (offer.message.underwritingDeadline <= Math.floor(Date.now() / 1000)) throw new Error('This underwriting offer has expired.')
      if (fundingTerms.message.deadline <= Math.floor(Date.now() / 1000)) throw new Error('The accepted funding terms have expired.')
      if (offer.message.protectionDeadline - Math.floor(Date.now() / 1000) < MIN_REMAINING_PROTECTION_SECONDS) throw new Error('This agreement is too close to its end time for early pay.')

      setStage('Checking request...')
      const publicClient = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const [asset, paused, allowed, gasBalance, gasPrice] = await Promise.all([
        publicClient.readContract({ address: offer.escrow, abi: ESCROW_ABI, functionName: 'asset' }),
        publicClient.readContract({ address: offer.escrow, abi: ESCROW_ABI, functionName: 'paused' }),
        publicClient.readContract({ address: offer.escrow, abi: ESCROW_ABI, functionName: 'allowedFunders', args: [account] }),
        publicClient.getBalance({ address: account }),
        publicClient.getGasPrice(),
      ])
      if (getAddress(asset) !== NATIVE_XLAYER_USDC) throw new FundingUiError('This offer uses a retired USDC escrow. Wait for HashPayStream to publish the native-USDC replacement.')
      if (paused) throw new FundingUiError('The X Layer escrow is paused.')
      if (!allowed) throw new FundingUiError('This funding wallet is not approved yet.')
      const gasReserve = gasPrice * 600_000n
      if (gasBalance < gasReserve) throw new FundingUiError(`Your funding wallet needs at least ${formatEther(gasReserve)} OKB for X Layer gas before funding.`)
      const [balance, allowance] = await Promise.all([
        publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: 'allowance', args: [account, offer.escrow] }),
      ])
      if (balance < amount) throw new FundingUiError(`Your funding wallet balance is below ${amountLabel}.`)

      await signer.switchChain(upfrontXLayerChain.id)
      const provider = await signer.getEthereumProvider()
      const walletClient = createWalletClient({ account, chain: upfrontXLayerChain, transport: custom(provider) })

      if (allowance < amount) {
        setStage('Confirm USDC · 1 of 2')
        const approval = await publicClient.simulateContract({
          account,
          address: asset,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [offer.escrow, amount],
        })
        const approvalHash = await walletClient.writeContract(approval.request)
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash })
        if (approvalReceipt.status !== 'success') throw new FundingUiError('The exact USDC approval reverted.')
      }

      setStage('Send payment · 2 of 2')
      const funding = await publicClient.simulateContract({
        account,
        address: offer.escrow,
        abi: ESCROW_ABI,
        functionName: 'fundAdvance',
        args: [offer.message, fundingTerms.message, offer.signature, fundingTerms.signature, fundingTerms.providerSignature],
      })
      const hash = await walletClient.writeContract(funding.request)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new FundingUiError('The X Layer funding transaction reverted.')
      setFundingHash(hash)
      setStage('')
      await Promise.resolve(onFunded?.()).catch(() => undefined)
    } catch (reason) {
      setStage('')
      setError(fundingError(reason))
    } finally {
      actionPending.current = false
    }
  }

  if (fundingHash) return <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">Early payment sent.</div>
  return <div className="mt-3">
    <button type="button" disabled={busy} onClick={() => void fund()} className="stream-primary w-full">{stage || 'Send early payment'}</button>
    {!signer && <p className="mt-2 text-[11px] leading-5 text-amber-700 dark:text-amber-300">Your funding wallet is still connecting.</p>}
    {error && <p role="alert" className="mt-2 text-[11px] leading-5 text-rose-700 dark:text-rose-300">{error}</p>}
  </div>
}
