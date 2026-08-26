import { useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
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
import { arcTestnet, upfrontXLayerChain } from '../lib/upfrontChains'

type Opportunity = {
  id: string
  agreementId: string
  positionId: Hex
  positionStatus: 'funded' | 'released' | 'refunded'
  funder?: string
  repaymentRecipient?: string
}

type SignedAttestation = {
  domain?: Record<string, unknown>
  primaryType?: string
  message?: Record<string, unknown>
  signature?: string
}

const API = '/api/hashpaystream/v1/upfront/protection'
const ESCROW = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS ?? '').trim()
const ARC_ROUTER = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS ?? '').trim()
const HEX32 = /^0x[a-fA-F0-9]{64}$/
const SIGNATURE = /^0x[a-fA-F0-9]{130}$/

const ESCROW_ABI = [{
  type: 'function', name: 'releaseAdvance', stateMutability: 'nonpayable', inputs: [
    { name: 'attestation', type: 'tuple', components: [
      { name: 'positionId', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'arcTermsHash', type: 'bytes32' },
      { name: 'termsHash', type: 'bytes32' }, { name: 'arcRecipient', type: 'address' }, { name: 'funder', type: 'address' },
      { name: 'repaymentRecipient', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
      { name: 'advanceAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
    ] },
    { name: 'protectionSignature', type: 'bytes' },
  ], outputs: [],
}] as const

const ROUTER_ABI = [
  { type: 'function', name: 'creditedAgreements', stateMutability: 'view', inputs: [{ name: 'arcAgreementHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'claimable', stateMutability: 'view', inputs: [{ name: 'funder', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'creditRepayment', stateMutability: 'nonpayable', inputs: [
    { name: 'credit', type: 'tuple', components: [
      { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'arcTermsHash', type: 'bytes32' }, { name: 'funder', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
    ] },
    { name: 'signature', type: 'bytes' },
  ], outputs: [] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
] as const

function integer(value: unknown, label: string) {
  const text = String(value ?? '')
  if (!/^\d+$/.test(text)) throw new Error(`${label} is invalid.`)
  return BigInt(text)
}

function timestamp(value: unknown, label: string) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} is invalid.`)
  return number
}

function hex32(value: unknown, label: string) {
  const text = String(value ?? '')
  if (!HEX32.test(text)) throw new Error(`${label} is invalid.`)
  return text as Hex
}

function address(value: unknown, label: string) {
  const text = String(value ?? '')
  if (!isAddress(text)) throw new Error(`${label} is invalid.`)
  return getAddress(text)
}

export default function UpfrontLifecycleButton({ opportunity, onUpdated }: { opportunity: Opportunity; onUpdated: () => Promise<void> | void }) {
  const { getAccessToken } = usePrivy()
  const { wallets, ready } = useWallets()
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const embedded = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
  const signer = embedded.length === 1 ? embedded[0] : undefined
  const busy = Boolean(stage)

  async function attestation(action: 'release' | 'repayment') {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(API, {
      method: 'POST', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, requestId: opportunity.id, agreementId: opportunity.agreementId, positionId: opportunity.positionId }),
    })
    const body = await response.json().catch(() => ({})) as { attestation?: SignedAttestation; error?: string }
    if (!response.ok || !body.attestation) throw new Error(body.error || 'The protected lifecycle proof is unavailable.')
    return body.attestation
  }

  async function release() {
    setStage('Checking Arc protection...'); setError(''); setSuccess('')
    try {
      if (!ready || !signer || !isAddress(ESCROW)) throw new Error('The funding wallet is not ready.')
      const account = getAddress(signer.address)
      const signed = await attestation('release')
      const domain = signed.domain ?? {}; const raw = signed.message ?? {}
      if (
        signed.primaryType !== 'ProtectionAttestation' || !SIGNATURE.test(String(signed.signature ?? ''))
        || Number(domain.chainId) !== upfrontXLayerChain.id || address(domain.verifyingContract, 'Escrow') !== getAddress(ESCROW)
        || hex32(raw.positionId, 'Position').toLowerCase() !== opportunity.positionId.toLowerCase() || address(raw.funder, 'Funder') !== account
        || address(raw.repaymentRecipient, 'Repayment wallet') !== account
      ) throw new Error('The release proof does not match this funding wallet.')
      const message = {
        positionId: hex32(raw.positionId, 'Position'), arcAgreementHash: hex32(raw.arcAgreementHash, 'Arc agreement'), arcTermsHash: hex32(raw.arcTermsHash, 'Arc terms'),
        termsHash: hex32(raw.termsHash, 'Terms'), arcRecipient: address(raw.arcRecipient, 'Arc recipient'), funder: address(raw.funder, 'Funder'),
        repaymentRecipient: address(raw.repaymentRecipient, 'Repayment wallet'), provider: address(raw.provider, 'Provider'),
        protectedAmount: integer(raw.protectedAmount, 'Protected amount'), advanceAmount: integer(raw.advanceAmount, 'Advance amount'),
        observedAt: timestamp(raw.observedAt, 'Observed time'), deadline: timestamp(raw.deadline, 'Deadline'),
      }
      setStage('Releasing advance...')
      await signer.switchChain(upfrontXLayerChain.id)
      const publicClient = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const walletClient = createWalletClient({ account, chain: upfrontXLayerChain, transport: custom(await signer.getEthereumProvider()) })
      const simulation = await publicClient.simulateContract({ account, address: getAddress(ESCROW), abi: ESCROW_ABI, functionName: 'releaseAdvance', args: [message, signed.signature as Hex] })
      const hash = await walletClient.writeContract(simulation.request)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The advance release reverted.')
      setSuccess('Advance released to the service provider.')
      await Promise.resolve(onUpdated()).catch(() => undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The advance could not be released.')
    } finally { setStage('') }
  }

  async function claim() {
    setStage('Checking customer repayment...'); setError(''); setSuccess('')
    try {
      if (!ready || !signer || !isAddress(ARC_ROUTER)) throw new Error('The repayment wallet is not ready.')
      const account = getAddress(signer.address)
      const signed = await attestation('repayment')
      const domain = signed.domain ?? {}; const raw = signed.message ?? {}
      if (
        signed.primaryType !== 'RepaymentCredit' || !SIGNATURE.test(String(signed.signature ?? ''))
        || Number(domain.chainId) !== arcTestnet.id || address(domain.verifyingContract, 'Repayment router') !== getAddress(ARC_ROUTER)
        || address(raw.funder, 'Repayment wallet') !== account
      ) throw new Error('The repayment proof does not match this funding wallet.')
      const message = {
        arcAgreementHash: hex32(raw.arcAgreementHash, 'Arc agreement'), arcTermsHash: hex32(raw.arcTermsHash, 'Arc terms'),
        funder: address(raw.funder, 'Repayment wallet'), amount: integer(raw.amount, 'Repayment amount'),
        observedAt: timestamp(raw.observedAt, 'Observed time'), deadline: timestamp(raw.deadline, 'Deadline'),
      }
      await signer.switchChain(arcTestnet.id)
      const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
      const [gasBalance, gasPrice] = await Promise.all([publicClient.getBalance({ address: account }), publicClient.getGasPrice()])
      const gasReserve = gasPrice * 800_000n
      if (gasBalance < gasReserve) throw new Error(`Funding wallet needs at least ${formatEther(gasReserve)} Arc Testnet USDC for repayment gas.`)
      const walletClient = createWalletClient({ account, chain: arcTestnet, transport: custom(await signer.getEthereumProvider()) })
      const router = getAddress(ARC_ROUTER)
      const credited = await publicClient.readContract({ address: router, abi: ROUTER_ABI, functionName: 'creditedAgreements', args: [message.arcAgreementHash] })
      if (!credited) {
        setStage('Crediting repayment...')
        const credit = await publicClient.simulateContract({ account, address: router, abi: ROUTER_ABI, functionName: 'creditRepayment', args: [message, signed.signature as Hex] })
        const creditHash = await walletClient.writeContract(credit.request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash: creditHash })
        if (receipt.status !== 'success') throw new Error('The Arc repayment credit reverted.')
      }
      const amount = await publicClient.readContract({ address: router, abi: ROUTER_ABI, functionName: 'claimable', args: [account] })
      if (amount === 0n) { setSuccess('This repayment has already been claimed.'); return }
      setStage('Claiming repayment...')
      const claimRequest = await publicClient.simulateContract({ account, address: router, abi: ROUTER_ABI, functionName: 'claim' })
      const claimHash = await walletClient.writeContract(claimRequest.request)
      const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimHash })
      if (claimReceipt.status !== 'success') throw new Error('The Arc repayment claim reverted.')
      setSuccess('Repayment claimed to your funding wallet.')
      await Promise.resolve(onUpdated()).catch(() => undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The repayment could not be claimed.')
    } finally { setStage('') }
  }

  if (opportunity.positionStatus === 'refunded') return <p className="mt-3 text-[11px] text-gray-500">Advance refunded.</p>
  return <div className="mt-3">
    <button type="button" disabled={busy || !ready || !signer} onClick={() => void (opportunity.positionStatus === 'funded' ? release() : claim())} className="w-full rounded-xl bg-gray-950 px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950">
      {stage || (opportunity.positionStatus === 'funded' ? 'Release protected advance' : 'Check and claim repayment')}
    </button>
    {success && <p className="mt-2 text-[11px] leading-5 text-emerald-700">{success}</p>}
    {error && <p role="alert" className="mt-2 text-[11px] leading-5 text-rose-700">{error}</p>}
  </div>
}
