import { useState } from 'react'
import { ArrowTopRightOnSquareIcon, CheckIcon, ChevronDownIcon, ClipboardIcon } from '@heroicons/react/24/outline'
import { isAddress } from 'viem'
import { upfrontXLayerChain } from '../lib/upfrontChains'

type FundingReceipt = {
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

  async function copyProof() {
    await navigator.clipboard.writeText(receipt.positionId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return <details className="group mt-5 rounded-2xl border border-gray-200 px-4 py-3 dark:border-white/10">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="block text-xs font-black text-gray-950 dark:text-white">Funding receipt</span><span className="mt-1 block text-[10px] text-gray-400">{STATUS[receipt.status]} on X Layer</span></span>
      <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">Verified</span><ChevronDownIcon className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" /></span>
    </summary>
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 dark:border-white/[0.07]">
      <Metric label="Funded" value={usdc(receipt.advanceUsdcUnits)} />
      <Metric label={refunded ? 'Returned' : completed ? 'Received' : 'Agreed repayment'} value={usdc(receipt.repaymentUsdcUnits)} />
      <Metric label={completed ? 'Profit earned' : refunded ? 'Profit' : 'Agreed profit'} value={usdc(receipt.profitUsdcUnits)} />
      <Metric label="Platform fee" value={usdc(receipt.platformFeeUsdcUnits)} />
    </div>
    <p className="mt-4 truncate font-mono text-[9px] text-gray-400">{receipt.positionId}</p>
    <div className={`mt-3 grid ${explorerUrl ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
      <button type="button" onClick={() => void copyProof()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-gray-200 text-[11px] font-bold dark:border-white/10">
        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardIcon className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy proof'}
      </button>
      {explorerUrl && <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-gray-950 text-[11px] font-bold text-white dark:bg-white dark:text-gray-950">View on X Layer<ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /></a>}
    </div>
  </details>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-400">{label}</p><p className="mt-1 text-[11px] font-black tabular-nums text-gray-950 dark:text-white">{value}</p></div>
}
