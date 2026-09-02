import { useEffect, useRef, useState } from 'react'
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
import { SETTLEMENT_RETRY_DELAY_MS, settlementRetryReady } from '../lib/stableSnapshots'

type Opportunity = {
  id: string
  agreementId: string
  positionId: Hex
  positionStatus: 'funded' | 'released' | 'settled' | 'refunded'
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
      { name: 'termsHash', type: 'bytes32' }, { name: 'fundingTermsHash', type: 'bytes32' },
      { name: 'arcRecipient', type: 'address' }, { name: 'funder', type: 'address' },
      { name: 'repaymentRecipient', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
      { name: 'advanceAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
    ] },
    { name: 'protectionSignature', type: 'bytes' },
  ], outputs: [],
}] as const

const ROUTER_ABI = [
  { type: 'function', name: 'settledAgreements', stateMutability: 'view', inputs: [{ name: 'arcAgreementHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'settleRepayment', stateMutability: 'nonpayable', inputs: [
    { name: 'settlement', type: 'tuple', components: [
      { name: 'arcAgreementHash', type: 'bytes32' }, { name: 'arcTermsHash', type: 'bytes32' }, { name: 'funder', type: 'address' },
      { name: 'provider', type: 'address' }, { name: 'treasury', type: 'address' },
      { name: 'funderAmount', type: 'uint256' }, { name: 'providerAmount', type: 'uint256' }, { name: 'treasuryAmount', type: 'uint256' },
      { name: 'observedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
    ] },
    { name: 'signature', type: 'bytes' },
  ], outputs: [] },
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

function lifecycleError(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  const code = typeof reason === 'object' && reason !== null && 'code' in reason ? String((reason as { code?: unknown }).code ?? '') : ''
  if (code === '4001' || ['user rejected', 'user denied', 'request rejected'].some(value => message.toLowerCase().includes(value))) return 'Transaction cancelled. No funds moved.'
  if (message.includes('still connecting') || message.includes('needs at least')) return message
  return fallback
}

export default function UpfrontLifecycleButton({ opportunity, onUpdated }: { opportunity: Opportunity; onUpdated: () => Promise<void> | void }) {
  const { getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [repaymentState, setRepaymentState] = useState<'checking' | 'waiting' | 'ready' | 'unavailable'>(opportunity.positionStatus === 'released' ? 'checking' : 'ready')
  const [settlementReadyObservedAt, setSettlementReadyObservedAt] = useState<number | null>(null)
  const [retryVisible, setRetryVisible] = useState(false)
  const actionPending = useRef(false)
  const embedded = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
  const signer = embedded.length === 1 ? embedded[0] : undefined
  const busy = Boolean(stage)

  useEffect(() => {
    if (opportunity.positionStatus !== 'released') return
    setRepaymentState('checking')
    setSettlementReadyObservedAt(null)
    setRetryVisible(false)
  }, [opportunity.positionId, opportunity.positionStatus])

  async function attestation(action: 'release' | 'repayment') {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(API, {
      method: 'POST', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, requestId: opportunity.id, agreementId: opportunity.agreementId, positionId: opportunity.positionId }),
    })
    const body = await response.json().catch(() => ({})) as { attestation?: SignedAttestation; error?: string }
    if (!response.ok || !body.attestation) {
      const failure = new Error(body.error || 'The protected lifecycle proof is unavailable.')
      throw Object.assign(failure, { status: response.status })
    }
    return body.attestation
  }

  useEffect(() => {
    if (opportunity.positionStatus !== 'released' || repaymentState === 'ready') return
    let cancelled = false
    const check = async () => {
      try {
        await attestation('repayment')
        if (!cancelled) {
          setRepaymentState('ready')
          setSettlementReadyObservedAt(current => current ?? Date.now())
          void Promise.resolve(onUpdated()).catch(() => undefined)
        }
      } catch (reason) {
        if (cancelled) return
        setRepaymentState(Number((reason as { status?: number }).status) === 409 ? 'waiting' : 'unavailable')
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 20_000)
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [opportunity.agreementId, opportunity.id, opportunity.positionId, opportunity.positionStatus, repaymentState])

  useEffect(() => {
    if (opportunity.positionStatus !== 'released' || repaymentState !== 'ready' || settlementReadyObservedAt === null) {
      setRetryVisible(false)
      return
    }
    const update = () => setRetryVisible(settlementRetryReady(settlementReadyObservedAt))
    update()
    const remaining = SETTLEMENT_RETRY_DELAY_MS - (Date.now() - settlementReadyObservedAt)
    if (remaining <= 0) return
    const timer = window.setTimeout(update, remaining)
    return () => window.clearTimeout(timer)
  }, [opportunity.positionStatus, repaymentState, settlementReadyObservedAt])

  async function release() {
    if (actionPending.current) return
    actionPending.current = true
    setStage('Checking protected payment...'); setError(''); setSuccess('')
    try {
      if (!signer || !isAddress(ESCROW)) throw new Error('The funding wallet is still connecting. Return to Earn and open this position again.')
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
        termsHash: hex32(raw.termsHash, 'Terms'), fundingTermsHash: hex32(raw.fundingTermsHash, 'Funding terms'),
        arcRecipient: address(raw.arcRecipient, 'Arc recipient'), funder: address(raw.funder, 'Funder'),
        repaymentRecipient: address(raw.repaymentRecipient, 'Repayment wallet'), provider: address(raw.provider, 'Provider'),
        protectedAmount: integer(raw.protectedAmount, 'Protected amount'), advanceAmount: integer(raw.advanceAmount, 'Advance amount'),
        observedAt: timestamp(raw.observedAt, 'Observed time'), deadline: timestamp(raw.deadline, 'Deadline'),
      }
      setStage('Sending early payment...')
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
      setError(lifecycleError(reason, 'The early payment could not be sent. No funds moved.'))
    } finally { actionPending.current = false; setStage('') }
  }

  async function claim() {
    if (actionPending.current) return
    actionPending.current = true
    setStage('Checking payment...'); setError(''); setSuccess('')
    try {
      if (!signer || !isAddress(ARC_ROUTER)) throw new Error('The repayment wallet is still connecting. Return to Earn and open this position again.')
      const account = getAddress(signer.address)
      const signed = await attestation('repayment')
      const domain = signed.domain ?? {}; const raw = signed.message ?? {}
      if (
        signed.primaryType !== 'SplitSettlement' || !SIGNATURE.test(String(signed.signature ?? ''))
        || domain.name !== 'HashPayStream Upfront Repayment' || domain.version !== '3'
        || Number(domain.chainId) !== arcTestnet.id || address(domain.verifyingContract, 'Repayment router') !== getAddress(ARC_ROUTER)
        || address(raw.funder, 'Repayment wallet') !== account
      ) throw new Error('The repayment proof does not match this funding wallet.')
      const message = {
        arcAgreementHash: hex32(raw.arcAgreementHash, 'Arc agreement'), arcTermsHash: hex32(raw.arcTermsHash, 'Arc terms'),
        funder: address(raw.funder, 'Repayment wallet'), provider: address(raw.provider, 'Service provider'), treasury: address(raw.treasury, 'HashPayStream treasury'),
        funderAmount: integer(raw.funderAmount, 'Funding repayment'), providerAmount: integer(raw.providerAmount, 'Provider remainder'), treasuryAmount: integer(raw.treasuryAmount, 'HashPayStream fee'),
        observedAt: timestamp(raw.observedAt, 'Observed time'), deadline: timestamp(raw.deadline, 'Deadline'),
      }
      if (message.funder === message.provider || message.funder === message.treasury || message.provider === message.treasury || message.funderAmount <= 0n || message.providerAmount <= 0n || message.treasuryAmount <= 0n) throw new Error('The repayment split is invalid.')
      await signer.switchChain(arcTestnet.id)
      const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
      const [gasBalance, gasPrice] = await Promise.all([publicClient.getBalance({ address: account }), publicClient.getGasPrice()])
      const gasReserve = gasPrice * 800_000n
      if (gasBalance < gasReserve) throw new Error(`Funding wallet needs at least ${formatEther(gasReserve)} Arc Testnet USDC for repayment gas.`)
      const walletClient = createWalletClient({ account, chain: arcTestnet, transport: custom(await signer.getEthereumProvider()) })
      const router = getAddress(ARC_ROUTER)
      const settled = await publicClient.readContract({ address: router, abi: ROUTER_ABI, functionName: 'settledAgreements', args: [message.arcAgreementHash] })
      if (settled) { setSuccess('This payment has already been settled.'); return }
      setStage('Completing payment...')
      const request = await publicClient.simulateContract({ account, address: router, abi: ROUTER_ABI, functionName: 'settleRepayment', args: [message, signed.signature as Hex] })
      const hash = await walletClient.writeContract(request.request)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The Arc split settlement reverted.')
      setSuccess('Funding partner, service provider, and HashPayStream were paid exactly as accepted.')
      await Promise.resolve(onUpdated()).catch(() => undefined)
    } catch (reason) {
      setError(lifecycleError(reason, 'The payment could not be completed. No funds moved.'))
    } finally { actionPending.current = false; setStage('') }
  }

  if (opportunity.positionStatus === 'refunded') return <p className="mt-3 text-[11px] text-gray-500">Advance refunded.</p>
  if (opportunity.positionStatus === 'settled') return <p className='mt-3 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300'>Payment completed.</p>
  const settlementFinalizing = repaymentState === 'ready' && settlementReadyObservedAt !== null
  if (opportunity.positionStatus === 'released' && !retryVisible) return <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]">
    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
      {repaymentState === 'waiting' ? 'Waiting for delivery approval' : settlementFinalizing ? 'Finalizing payment automatically…' : repaymentState === 'unavailable' ? 'Payment status is temporarily unavailable' : 'Checking delivery status…'}
    </p>
    <p className="mt-1 text-[11px] leading-5 text-gray-500">
      {repaymentState === 'waiting' ? 'The service provider must submit the work, then the customer approves the protected payment.' : settlementFinalizing ? 'HashPayStream is retrying in the background. No action is needed.' : 'HashPayStream will keep checking automatically.'}
    </p>
    {repaymentState === 'unavailable' && <button type="button" onClick={() => setRepaymentState('checking')} className="mt-2 text-[11px] font-bold text-gray-500 underline underline-offset-2">Check again</button>}
  </div>
  const label = opportunity.positionStatus === 'funded' ? 'Send early payment' : 'Retry settlement'
  return <div className="mt-3">
    <button type="button" disabled={busy} onClick={() => void (opportunity.positionStatus === 'funded' ? release() : claim())} className="stream-primary w-full">
      {stage || label}
    </button>
    {opportunity.positionStatus === 'released' && <p className="mt-2 text-[11px] leading-5 text-gray-500">Automatic settlement is still running. Retry only after the 30-minute recovery window.</p>}
    {success && <p className="mt-2 text-[11px] leading-5 text-emerald-700 dark:text-emerald-300">{success}</p>}
    {error && <p role="alert" className="mt-2 text-[11px] leading-5 text-rose-700 dark:text-rose-300">{error}</p>}
  </div>
}
