import UnifiedReceipt from './UnifiedReceipt'
import type { PaylinkReceipt } from '../lib/paymentReceiptPdf'
import { useState } from 'react'
import { ArrowTopRightOnSquareIcon, CheckIcon, ChevronDownIcon, ClipboardIcon } from '@heroicons/react/24/outline'
import { isAddress } from 'viem'
import { upfrontXLayerChain } from '../lib/upfrontChains'

type FundingReceipt = {
  title?: string
  funder?: string
  repaymentRecipient?: string
  providerRemainderUsdcUnits?: string
  providerTotalUsdcUnits?: string
  positionId: string
  status: 'funded' | 'released' | 'settled' | 'refunded'
  escrowAddress?: string
  advanceUsdcUnits: string
  repaymentUsdcUnits: string
  profitUsdcUnits: string
  platformFeeUsdcUnits: string
}

const STATUS: Record<FundingReceipt['status'], string> = {
  funded: 'Funds protected',
  released: 'Early payment sent',
  settled: 'Payment completed',
  refunded: 'Funding returned',
}

function usdc(units: string) {
  try {
    const value = BigInt(units || '0')
    const whole = value / 1_000_000n
    const decimal = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return `${decimal ? `${whole}.${decimal}` : whole} USDC`
  } catch {
    return '0 USDC'
  }
}

export default function FundingPositionReceipt({ receipt }: { receipt: FundingReceipt }) {
  const [copied, setCopied] = useState(false)
  const completed = receipt.status === 'settled'
  const refunded = receipt.status === 'refunded'
  const explorer = upfrontXLayerChain.blockExplorers?.default.url
  const explorerUrl = explorer && receipt.escrowAddress && isAddress(receipt.escrowAddress)
    ? `${explorer}/address/${receipt.escrowAddress}`
    : ''

  const shared: PaylinkReceipt = {
    type: 'funding', receiptId: receipt.positionId, receiptHash: '', title: receipt.title || 'Funding receipt',
    status: receipt.status, fundingStatus: receipt.status, eventId: receipt.positionId, txHash: '',
    chain: completed ? 'arc-testnet' : upfrontXLayerChain.id === 196 ? 'xlayer-mainnet' : 'xlayer-testnet', payer: receipt.funder || '',
    amount: usdc(completed || refunded ? receipt.repaymentUsdcUnits : receipt.advanceUsdcUnits).replace(' USDC', ''),
    asset: 'USDC', createdAt: 0, referenceId: receipt.positionId,
    fundingRows: [
      ...(receipt.title ? [{ label: 'Agreement', value: receipt.title }] : []),
      { label: 'Funded on X Layer', value: usdc(receipt.advanceUsdcUnits) },
      { label: refunded ? 'Returned on X Layer' : completed ? 'Received on Arc' : 'Agreed repayment on Arc', value: usdc(receipt.repaymentUsdcUnits) },
      { label: completed ? 'Profit earned' : refunded ? 'Profit' : 'Agreed profit', value: usdc(refunded ? '0' : receipt.profitUsdcUnits) },
      ...(receipt.providerRemainderUsdcUnits && !refunded ? [{ label: completed ? 'Provider received later' : 'Provider receives later', value: usdc(receipt.providerRemainderUsdcUnits) }] : []),
      ...(receipt.providerTotalUsdcUnits && !refunded ? [{ label: 'Provider total', value: usdc(receipt.providerTotalUsdcUnits) }] : []),
      { label: completed || refunded ? 'Platform fee' : 'Agreed platform fee', value: usdc(refunded ? '0' : receipt.platformFeeUsdcUnits) },
      ...(receipt.funder ? [{ label: 'Funder', value: receipt.funder, mono: true }] : []),
      ...(receipt.repaymentRecipient ? [{ label: 'Repayment recipient', value: receipt.repaymentRecipient, mono: true }] : []),
    ],
  }

  async function copyProof() {
    await navigator.clipboard.writeText(receipt.positionId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return <details className="group mt-5 rounded-2xl border border-gray-200 px-4 py-3 dark:border-white/10">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="block text-xs font-black text-gray-950 dark:text-white">Funding receipt</span><span className="mt-1 block text-[10px] text-gray-400">{STATUS[receipt.status]} on {completed ? 'Arc' : 'X Layer'}</span></span>
      <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[9px] font-black text-gray-600 dark:bg-white/10 dark:text-gray-300">On-chain</span><ChevronDownIcon className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" /></span>
    </summary>
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 dark:border-white/[0.07]">
      <Metric label="Funded" value={usdc(receipt.advanceUsdcUnits)} />
      <Metric label={refunded ? 'Returned' : completed ? 'Received' : 'Agreed repayment'} value={usdc(receipt.repaymentUsdcUnits)} />
      <Metric label={completed ? 'Profit earned' : refunded ? 'Profit' : 'Agreed profit'} value={usdc(refunded ? '0' : receipt.profitUsdcUnits)} />
      <Metric label={completed || refunded ? "Platform fee" : "Agreed platform fee"} value={usdc(refunded ? '0' : receipt.platformFeeUsdcUnits)} />
    </div>
    <p className="mt-4 truncate font-mono text-[9px] text-gray-400">{receipt.positionId}</p>
    <div className={`mt-3 grid ${explorerUrl ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
      <button type="button" onClick={() => void copyProof()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-gray-200 text-[11px] font-bold dark:border-white/10">
        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardIcon className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy proof'}
      </button>
      {explorerUrl && <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-gray-950 text-[11px] font-bold text-white dark:bg-white dark:text-gray-950">View funding on X Layer<ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /></a>}
    </div>
    <UnifiedReceipt receipt={shared} className="mt-4" />
  </details>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-400">{label}</p><p className="mt-1 text-[11px] font-black tabular-nums text-gray-950 dark:text-white">{value}</p></div>
}
