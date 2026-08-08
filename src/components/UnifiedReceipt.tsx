import { useState } from 'react'
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, CheckIcon, EyeIcon, ShareIcon } from '@heroicons/react/24/outline'
import {
  arcTransactionUrl,
  createPaymentReceiptPdf,
  paymentReceiptFileName,
  type PaylinkReceipt,
} from '../lib/paymentReceiptPdf'

type UnifiedReceiptProps = {
  receipt?: PaylinkReceipt
  className?: string
  label?: string
  showAction?: boolean
  compact?: boolean
}

function openPreparingWindow() {
  const preview = window.open('about:blank', '_blank')
  if (!preview) return null
  preview.opener = null
  preview.document.title = 'Preparing receipt'
  preview.document.body.style.cssText = 'margin:0;display:grid;min-height:100vh;place-items:center;background:#f5f5f7;color:#6b7280;font:600 13px Inter,Arial,sans-serif'
  preview.document.body.textContent = 'Preparing receipt PDF...'
  return preview
}

export default function UnifiedReceipt({ receipt, className = '', label = 'Open receipt PDF', showAction = true, compact = false }: UnifiedReceiptProps) {
  const [opening, setOpening] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState('')
  const explorerUrl = arcTransactionUrl(receipt)

  if (!showAction) return null

  async function resolvePdf() {
    const resolved = receipt
    if (!resolved) throw new Error('Receipt is not ready.')
    return { resolved, pdf: await createPaymentReceiptPdf(resolved) }
  }

  async function openPdf() {
    if (opening) return
    const preview = openPreparingWindow()
    setOpening(true)
    setOpened(false)
    setError('')
    try {
      const { pdf } = await resolvePdf()
      const url = URL.createObjectURL(pdf)
      if (preview) preview.location.replace(url)
      else {
        const link = document.createElement('a')
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000)
      setOpened(true)
      window.setTimeout(() => setOpened(false), 1800)
    } catch (reason) {
      preview?.close()
      setError(reason instanceof Error ? reason.message : 'Receipt PDF could not be opened.')
    } finally {
      setOpening(false)
    }
  }

  async function sharePdf() {
    if (opening || sharing) return
    setSharing(true)
    setError('')
    try {
      const { resolved, pdf } = await resolvePdf()
      const file = new File([pdf], paymentReceiptFileName(resolved), { type: 'application/pdf' })
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'HashPayStream agreement receipt', files: [file] })
        return
      }
      const url = URL.createObjectURL(pdf)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Receipt PDF could not be shared.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void openPdf()}
          disabled={opening || sharing}
          className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white font-bold text-gray-950 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.08] dark:text-white dark:hover:bg-white/[0.12] ${compact ? 'min-h-9 px-2.5 text-[11px]' : 'min-h-10 px-3 text-xs'}`}
        >
          {opening ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : opened ? <CheckIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
          {opening ? 'Preparing' : opened ? 'Opened' : label === 'Open receipt PDF' ? 'View details' : label}
        </button>
        <button
          type="button"
          onClick={() => void sharePdf()}
          disabled={opening || sharing}
          className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-gray-950 font-bold text-white shadow-sm transition hover:bg-black active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100 ${compact ? 'min-h-9 px-2.5 text-[11px]' : 'min-h-10 px-3 text-xs'}`}
        >
          {sharing ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <ShareIcon className="h-3.5 w-3.5" />}
          {sharing ? 'Preparing' : 'Share receipt'}
        </button>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target={'_blank'}
            rel={'noopener noreferrer'}
            className={'col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 shadow-sm transition hover:text-gray-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:text-white'}
          >
            <ArrowTopRightOnSquareIcon className={'h-3.5 w-3.5'} />
            View on Arc Explorer
          </a>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-500">{error}</p>}
    </div>
  )
}
