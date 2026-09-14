import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { CheckCircleIcon, CubeTransparentIcon } from '@heroicons/react/24/outline'
import {
  createPublicClient, createWalletClient, custom, formatEther, formatUnits, getAddress, http, isAddress,
  recoverTypedDataAddress, type Hex,
} from 'viem'
import { STOCK_FUNDER_RISK } from '../lib/stockFundingOffers'
import {
  AGREEMENT_BACKED_STOCK_DELIVERY_ABI, STOCK_DELIVERY_TERMS_TYPES, STOCK_DELIVERY_TOKEN_ABI,
  stockDeliveryProtectionMessage, stockDeliveryTermsMessage, stockDeliveryUnderwritingMessage,
  verifyStockDeliveryAuthorization, type StockDeliveryAuthorization,
} from '../lib/stockDeliveryProtocol'
import { upfrontXLayerChain } from '../lib/upfrontChains'

const API = '/api/hashpaystream/v1/upfront/stock-deliveries'
const EXPECTED_CONTRACT = String(import.meta.env.VITE_HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS ?? '').trim()
const EXPECTED_ASSET = String(import.meta.env.VITE_HASHPAYSTREAM_STOCK_ASSET_ADDRESS ?? '').trim()
const CONFIRMATIONS = 2

type DeliveryRequest = {
  id: Hex
  agreementId: string
  authorization: StockDeliveryAuthorization
  workerSignature: Hex
  status: 'requested' | 'delivered' | 'settled' | 'declined' | 'expired'
  expiresAt: string
  delivery?: { transactionHash: Hex }
}

const usdc = (units: string) => formatUnits(BigInt(units), 6) + ' USDC'
const short = (value: string) => value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-5)}` : value
const pendingKey = (id: string) => `hps:stock-delivery:${id}`
function pendingTransaction(id: string) {
  try {
    const value = typeof window === 'undefined' ? '' : window.sessionStorage.getItem(pendingKey(id)) ?? ''
    return /^0x[a-fA-F0-9]{64}$/.test(value) ? value as Hex : ''
  } catch { return '' }
}
function savePendingTransaction(id: string, hash: Hex) { try { window.sessionStorage.setItem(pendingKey(id), hash) } catch { /* receipt confirmation continues */ } }
function clearPendingTransaction(id: string) { try { window.sessionStorage.removeItem(pendingKey(id)) } catch { /* no recovery state to clear */ } }

function deliveryError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  const code = typeof reason === 'object' && reason !== null && 'code' in reason ? String((reason as { code?: unknown }).code ?? '') : ''
  if (code === '4001' || /user (?:rejected|denied)|request rejected/i.test(message)) return 'Transaction cancelled. No tokens moved.'
  return message || 'The stock delivery could not be completed.'
}

export default function StockDeliveryFunderPanel() {
  const { getAccessToken } = usePrivy(), { wallets } = useWallets()
  const [requests, setRequests] = useState<DeliveryRequest[]>([])
  const [executionEnabled, setExecutionEnabled] = useState(false)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [busyId, setBusyId] = useState(''), [consentId, setConsentId] = useState('')
  const [tokenInfo, setTokenInfo] = useState<{ symbol: string; decimals: number }>()
  const pending = useRef(false)
  const load = useCallback(async () => {
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to view stock delivery requests.')
      const response = await fetch(`${API}?view=funder`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } })
      const body = await response.json().catch(() => ({})) as { requests?: DeliveryRequest[]; executionEnabled?: boolean; error?: string }
      if (!response.ok) throw new Error(body.error || 'Stock delivery requests are unavailable.')
      setRequests(body.requests ?? []); setExecutionEnabled(body.executionEnabled === true)
    } catch (reason) { setExecutionEnabled(false); setError(reason instanceof Error ? reason.message : 'Stock delivery requests are unavailable.') }
    finally { setLoading(false) }
  }, [getAccessToken])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => {
    if (!isAddress(EXPECTED_ASSET)) return
    const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() }), asset = getAddress(EXPECTED_ASSET)
    void Promise.all([
      client.readContract({ address: asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'symbol' }),
      client.readContract({ address: asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'decimals' }),
    ]).then(([symbol, decimals]) => {
      if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) setTokenInfo({ symbol: String(symbol).trim().slice(0, 16), decimals })
    }).catch(() => undefined)
  }, [])

  async function deliver(request: DeliveryRequest) {
    if (pending.current || consentId !== request.id || (!executionEnabled && !pendingTransaction(request.id))) return
    pending.current = true; setBusyId(request.id); setError('')
    try {
      const recordedHash = pendingTransaction(request.id)
      if (recordedHash) {
        setBusyId(request.id + ':confirm')
        const token = await getAccessToken()
        if (!token) throw new Error('Sign in again to record the confirmed stock delivery.')
        const response = await fetch(API, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm_delivery', deliveryId: request.id, transactionHash: recordedHash }) })
        const body = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(body.error || 'The stock delivery confirmation is still pending.')
        clearPendingTransaction(request.id); setConsentId(''); await load(); return
      }
      const embedded = wallets.filter(wallet => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
      if (embedded.length !== 1) throw new Error('Your X Layer funding wallet is still connecting.')
      if (!isAddress(EXPECTED_CONTRACT) || !isAddress(EXPECTED_ASSET)) throw new Error('Stock delivery is not configured in this app build.')
      const signer = embedded[0], account = getAddress(signer.address), contract = getAddress(EXPECTED_CONTRACT), asset = getAddress(EXPECTED_ASSET)
      const authorization = request.authorization, now = Math.floor(Date.now() / 1000)
      if (authorization.domain.name !== 'HashPayStream Stock Delivery' || authorization.domain.version !== '1'
        || authorization.domain.chainId !== upfrontXLayerChain.id || getAddress(authorization.domain.verifyingContract) !== contract
        || getAddress(authorization.terms.funder) !== account || getAddress(authorization.terms.repaymentRecipient) !== account
        || getAddress(authorization.terms.stockAsset) !== asset || authorization.deliveryId !== request.id || authorization.terms.deadline <= now) {
        throw new Error('This stock delivery request changed or expired. Refresh requests.')
      }
      const publicClient = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const [paused, allowedFunder, allowedAsset, arcRouter, underwritingSigner, riskSigner, protectionSigner, agreementUsed, gasBalance, gasPrice] = await Promise.all([
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'paused' }),
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'allowedFunders', args: [account] }),
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'allowedStockAssets', args: [asset] }),
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'arcRepaymentRouter' }),
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'underwritingSigner' }),
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'riskSigner' }),
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'protectionSigner' }),
        publicClient.readContract({ address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'usedArcAgreements', args: [authorization.protection.arcAgreementHash] }),
        publicClient.getBalance({ address: account }), publicClient.getGasPrice(),
      ])
      if (paused) throw new Error('Stock delivery is paused for production review.')
      if (!allowedFunder || !allowedAsset) throw new Error('This funding wallet or stock token is not approved.')
      if (agreementUsed) throw new Error('This protected agreement already has a stock delivery.')
      if (getAddress(arcRouter) !== getAddress(authorization.protection.arcRecipient)) throw new Error('The Arc repayment route does not match this request.')
      await verifyStockDeliveryAuthorization(authorization, {
        chainId: upfrontXLayerChain.id, deliveryContract: contract, worker: authorization.offer.worker,
        workerArcRecipient: authorization.terms.workerArcRecipient, funder: account, repaymentRecipient: account,
        platformTreasury: authorization.terms.platformTreasury, stockAsset: asset,
        advanceUsdcAmount: authorization.terms.advanceUsdcAmount,
        underwritingSigner: getAddress(underwritingSigner), riskSigner: getAddress(riskSigner), protectionSigner: getAddress(protectionSigner), now,
      })
      const recoveredWorker = await recoverTypedDataAddress({ domain: authorization.domain, types: STOCK_DELIVERY_TERMS_TYPES, primaryType: 'DeliveryTerms', message: stockDeliveryTermsMessage(authorization.terms), signature: request.workerSignature })
      if (getAddress(recoveredWorker) !== getAddress(authorization.offer.worker)) throw new Error('The worker acceptance signature is invalid.')
      const amount = BigInt(authorization.terms.stockTokenAmount)
      const [balance, allowance, decimals, symbol] = await Promise.all([
        publicClient.readContract({ address: asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'allowance', args: [account, contract] }),
        publicClient.readContract({ address: asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'symbol' }),
      ])
      if (amount <= 0n || balance < amount) throw new Error(`Your ${symbol} balance is below ${formatUnits(amount, decimals)}.`)
      const gasReserve = gasPrice * 900_000n
      if (gasBalance < gasReserve) throw new Error(`Your funding wallet needs at least ${formatEther(gasReserve)} OKB for X Layer gas.`)
      await signer.switchChain(upfrontXLayerChain.id)
      const walletClient = createWalletClient({ account, chain: upfrontXLayerChain, transport: custom(await signer.getEthereumProvider()) })
      if (allowance !== amount) {
        setBusyId(request.id + ':approve')
        const approval = await publicClient.simulateContract({ account, address: asset, abi: STOCK_DELIVERY_TOKEN_ABI, functionName: 'approve', args: [contract, amount] })
        const approvalHash = await walletClient.writeContract(approval.request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash, confirmations: CONFIRMATIONS })
        if (receipt.status !== 'success') throw new Error('The exact stock-token approval reverted.')
      }
      setBusyId(request.id + ':deliver')
      const simulation = await publicClient.simulateContract({
        account, address: contract, abi: AGREEMENT_BACKED_STOCK_DELIVERY_ABI, functionName: 'deliver',
        args: [stockDeliveryUnderwritingMessage(authorization.offer), stockDeliveryTermsMessage(authorization.terms), stockDeliveryProtectionMessage(authorization.protection), authorization.underwritingSignature, authorization.riskSignature, request.workerSignature, authorization.protectionSignature],
      })
      const transactionHash = await walletClient.writeContract(simulation.request)
      savePendingTransaction(request.id, transactionHash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: CONFIRMATIONS })
      if (receipt.status !== 'success') throw new Error('The X Layer stock delivery reverted.')
      const token = await getAccessToken()
      if (!token) throw new Error('The tokens moved, but your session expired before recording confirmation. Refresh to recover it.')
      const response = await fetch(API, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm_delivery', deliveryId: request.id, transactionHash }) })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'The tokens moved, but confirmation is still pending. Refresh to recover it.')
      clearPendingTransaction(request.id); setConsentId(''); await load()
    } catch (reason) { setError(deliveryError(reason)) }
    finally { pending.current = false; setBusyId('') }
  }

  const active = requests.filter(item => item.status === 'requested')
  const completed = requests.filter(item => item.status === 'delivered' || item.status === 'settled')
  if (loading) return <div className="stream-card h-24 animate-pulse" aria-label="Loading stock delivery requests" />
  return <section>
    <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-xs font-black text-gray-950 dark:text-white">Stock delivery requests</h2><span className="text-[10px] font-bold text-gray-400">{active.length}</span></div>
    {!error && active.length === 0 ? <div className="stream-empty px-5 py-8"><CubeTransparentIcon className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-3 text-sm font-black text-gray-950 dark:text-white">No stock deliveries</p><p className="mt-1 text-[11px] text-gray-400">Worker-selected stock requests will appear here.</p></div>
      : <div className="space-y-3">{active.map(request => {
        const terms = request.authorization.terms
        const accepted = consentId === request.id
        const stage = busyId === request.id + ':approve' ? 'Approve exact token amount' : busyId === request.id + ':deliver' ? 'Send stock tokens' : busyId === request.id + ':confirm' ? 'Record confirmed delivery' : busyId === request.id ? 'Checking request' : ''
        return <article key={request.id} className="stream-card p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-gray-950 dark:text-white">Stock Early Pay</p><p className="mt-1 font-mono text-[9px] text-gray-400">Worker {short(request.authorization.offer.worker)}</p></div><p className="text-right text-xs font-black">{usdc(terms.advanceUsdcAmount)}</p></div>
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.035]"><div><p className="text-[9px] font-bold text-gray-400">Stock delivered</p><p className="mt-1 break-all text-[10px] font-black">{tokenInfo ? `${formatUnits(BigInt(terms.stockTokenAmount), tokenInfo.decimals)} ${tokenInfo.symbol}` : terms.stockTokenAmount}</p><p className="mt-1 break-all font-mono text-[8px] text-gray-400">{terms.stockTokenAmount} units</p></div><div><p className="text-[9px] font-bold text-gray-400">USDC repayment</p><p className="mt-1 text-[10px] font-black">{usdc(terms.funderRepaymentAmount)}</p></div></div>
          <p className="mt-3 text-[10px] leading-5 text-gray-500 dark:text-gray-400">{STOCK_FUNDER_RISK}</p>
          <label className="mt-3 flex items-start gap-2 text-[10px] leading-5"><input type="checkbox" className="mt-1" disabled={Boolean(busyId)} checked={accepted} onChange={event => setConsentId(event.target.checked ? request.id : '')} />I reviewed the exact token amount, worker wallet, fixed USDC repayment, and contract risk.</label>
          <button type="button" disabled={(!executionEnabled && !pendingTransaction(request.id)) || !accepted || Boolean(busyId)} onClick={() => void deliver(request)} className="stream-primary mt-3 w-full">{stage || (pendingTransaction(request.id) ? 'Record confirmed delivery' : executionEnabled ? 'Deliver stock tokens' : 'Delivery paused')}</button>
          <p className="mt-2 text-[9px] text-gray-400">Expires {new Date(request.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Your wallet approves only the exact token amount if needed.</p>
        </article>
      })}</div>}
    {completed.length > 0 && <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircleIcon className="mr-2 inline h-4 w-4" />{completed.length} verified stock {completed.length === 1 ? 'delivery' : 'deliveries'}</div>}
    {error && <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-black underline">Refresh</button></div>}
  </section>
}
