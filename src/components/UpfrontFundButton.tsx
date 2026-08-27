import { useState } from 'react'
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
const BYTES32 = /^0x[a-fA-F0-9]{64}$/
const SIGNATURE = /^0x[a-fA-F0-9]{130}$/

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
      { name: 'advanceAmount', type: 'uint256' },
      { name: 'repaymentRecipient', type: 'address' },
      { name: 'underwritingSignature', type: 'bytes' },
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

export default function UpfrontFundButton({ opportunity, onFunded }: { opportunity: Opportunity; onFunded?: () => Promise<void> | void }) {
  const { wallets, ready } = useWallets()
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [fundingHash, setFundingHash] = useState('')
  const embedded = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
  const signer = embedded.length === 1 ? embedded[0] : undefined
  const amount = integer(opportunity.requestedAdvanceUsdcUnits, 'Advance amount')
  const amountLabel = `${Number(amount) / 1_000_000} USDC`
  const busy = Boolean(stage) && !fundingHash

  async function fund() {
    setError('')
    setFundingHash('')
    try {
      if (!ready || !signer) throw new Error('Your HashPayStream funding wallet is not ready. Refresh this page and try again.')
      const offer = parseOffer(opportunity)
      if (!isAddress(opportunity.providerPayoutAddress) || getAddress(opportunity.providerPayoutAddress) !== offer.message.provider) {
        throw new Error('The displayed payout address does not match the signed underwriting offer.')
      }
      const account = getAddress(signer.address)
      if (amount <= 0n || amount > offer.message.protectedAmount * BigInt(offer.message.maxAdvanceBps) / 10_000n) {
        throw new Error('The requested advance exceeds the signed PolyDesk limit.')
      }
      if (offer.message.underwritingDeadline <= Math.floor(Date.now() / 1000)) throw new Error('This underwriting offer has expired.')

      setStage('Checking escrow controls...')
      const publicClient = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const [asset, paused, allowed, gasBalance, gasPrice] = await Promise.all([
        publicClient.readContract({ address: offer.escrow, abi: ESCROW_ABI, functionName: 'asset' }),
        publicClient.readContract({ address: offer.escrow, abi: ESCROW_ABI, functionName: 'paused' }),
        publicClient.readContract({ address: offer.escrow, abi: ESCROW_ABI, functionName: 'allowedFunders', args: [account] }),
        publicClient.getBalance({ address: account }),
        publicClient.getGasPrice(),
      ])
      if (paused) throw new Error('The X Layer escrow is paused.')
      if (!allowed) throw new Error('This funding wallet is not approved yet.')
      const gasReserve = gasPrice * 600_000n
      if (gasBalance < gasReserve) throw new Error(`Your funding wallet needs at least ${formatEther(gasReserve)} OKB for X Layer gas before funding.`)
      const [balance, allowance] = await Promise.all([
        publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: 'allowance', args: [account, offer.escrow] }),
      ])
      if (balance < amount) throw new Error(`Your funding wallet balance is below ${amountLabel}.`)

      await signer.switchChain(upfrontXLayerChain.id)
      const provider = await signer.getEthereumProvider()
      const walletClient = createWalletClient({ account, chain: upfrontXLayerChain, transport: custom(provider) })

      if (allowance < amount) {
        setStage(`Approve exactly ${amountLabel}...`)
        const approval = await publicClient.simulateContract({
          account,
          address: asset,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [offer.escrow, amount],
        })
        const approvalHash = await walletClient.writeContract(approval.request)
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash })
        if (approvalReceipt.status !== 'success') throw new Error('The exact USDC approval reverted.')
      }

      setStage(`Fund ${amountLabel}...`)
      const funding = await publicClient.simulateContract({
        account,
        address: offer.escrow,
        abi: ESCROW_ABI,
        functionName: 'fundAdvance',
        args: [offer.message, amount, account, offer.signature],
      })
      const hash = await walletClient.writeContract(funding.request)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The X Layer funding transaction reverted.')
      setFundingHash(hash)
      setStage('')
      await Promise.resolve(onFunded?.()).catch(() => undefined)
    } catch (reason) {
      setStage('')
      setError(reason instanceof Error ? reason.message : 'Your funding wallet could not fund this offer.')
    }
  }

  if (fundingHash) return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800"><strong>Advance funded.</strong><p className="mt-1 break-all font-mono">{fundingHash}</p></div>
  return <div className="mt-3">
    <button type="button" disabled={busy || !ready || !signer} onClick={() => void fund()} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{stage || `Approve and fund ${amountLabel}`}</button>
    {!signer && <p className="mt-2 text-[11px] leading-5 text-amber-700">Your HashPayStream funding wallet is still connecting.</p>}
    {error && <p className="mt-2 text-[11px] leading-5 text-rose-700">{error}</p>}
  </div>
}
