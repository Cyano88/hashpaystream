import { shareNativeReceipt } from '../lib/nativeReceiptShare'
import type { EarlyPaySettlement } from '../lib/serviceRequests'
import SubmittedWorkLink from './SubmittedWorkLink'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  EyeIcon,
  ShareIcon,
} from '@heroicons/react/24/outline'
import {
  createPaymentReceiptImage,
  createPaymentReceiptPdf,
  paymentReceiptFileName,
  paymentReceiptImageFileName,
  paymentReceiptView,
  type PaylinkReceipt,
} from '../lib/paymentReceiptPdf'
import { HashPayStreamMark } from './HashPayStreamMark'

type UnifiedReceiptProps = {
  receipt?: PaylinkReceipt
  settlement?: EarlyPaySettlement
  submittedWorkUrl?: string
  className?: string
  label?: string
  showAction?: boolean
  compact?: boolean
}

type ReceiptSurface = 'details' | 'receipt' | null
function StateIcon({ receipt }: { receipt: PaylinkReceipt }) {
  const { state } = paymentReceiptView(receipt)
  const style = state === 'pending' ? 'bg-blue-600' : state === 'reversed' ? 'bg-amber-500' : 'bg-emerald-500'
  return <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${style}`}>
    {state === 'pending' ? <ClockIcon className="h-3.5 w-3.5" /> : state === 'reversed' ? <ArrowPathIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />}
  </span>
}

function stateLabel(receipt: PaylinkReceipt) { return paymentReceiptView(receipt).statusLabel }

function ReceiptDocument({ receipt }: { receipt: PaylinkReceipt }) {
  const view = useMemo(() => paymentReceiptView(receipt), [receipt])
  return <article className="mx-auto flex min-h-full w-full max-w-md flex-col bg-white px-7 pb-4 pt-5 text-gray-950">
    <header className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-3"><HashPayStreamMark className="h-9 w-9 shrink-0 object-contain" /><span className="truncate text-sm font-bold tracking-[-0.02em]">HashPayStream</span></span>
      <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-gray-500">{view.badge}</span>
    </header>
    <section className="mt-5"><div className="flex items-center gap-2"><StateIcon receipt={receipt} /><h2 className="text-[15px] font-semibold tracking-[-0.02em]">{stateLabel(receipt)}</h2></div><p className="mt-1 text-[11px] font-medium text-gray-400">{view.timestamp}</p><p className="mt-4 break-words text-[30px] font-bold tracking-[-0.045em]">{view.amount}</p></section>
    <dl className="mt-4 border-t border-gray-100">{view.rows.map(row => <div key={row.label} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-5 py-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">{row.label}</dt><dd className={`min-w-0 break-words text-right text-[11px] font-semibold leading-5 text-gray-700 ${row.mono ? 'font-mono' : ''}`}>{row.value || '-'}</dd></div>)}</dl>
    <div className="mt-2 border-t border-gray-100 pt-3"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">Reference ID</p><p className="mt-1 break-all font-mono text-[10px] font-semibold leading-5 text-gray-600">{view.reference}</p></div>
    <footer className="mt-auto pt-3 text-center text-[10px] font-semibold text-gray-400">Powered by Hash PayLink</footer>
  </article>
}

function TransactionDetails({ receipt, copied, copy }: { receipt: PaylinkReceipt; copied: boolean; copy: () => void }) {
  const view = paymentReceiptView(receipt)
  return <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-8"><div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
    <div className="flex items-center gap-3"><StateIcon receipt={receipt} /><span><span className="block text-sm font-bold">{stateLabel(receipt)}</span><span className="mt-0.5 block text-[11px] font-medium text-gray-400">{view.timestamp}</span></span></div>
    <p className="mt-8 text-[32px] font-bold tracking-[-0.045em]">{view.amount}</p>
    <dl className="mt-7 divide-y divide-gray-100 border-t border-gray-100 dark:divide-white/10 dark:border-white/10">{[...view.rows, { label: 'Status', value: view.badge }].map(row => <div key={row.label} className="flex items-start justify-between gap-5 py-3.5"><dt className="text-[11px] font-medium text-gray-400">{row.label}</dt><dd className="max-w-[66%] break-words text-right text-[11px] font-semibold leading-5 text-gray-700 dark:text-gray-200">{row.value || '-'}</dd></div>)}</dl>
    <div className="border-t border-gray-100 pt-4 dark:border-white/10"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">Reference ID</p><button type="button" onClick={copy} className="inline-flex h-10 w-10 items-center justify-center rounded-full" aria-label="Copy reference">{copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}</button></div><p className="mt-2 break-all font-mono text-[10px] font-semibold leading-5 text-gray-600 dark:text-gray-300">{view.reference}</p></div>
    {receipt.submittedWorkUrl && <SubmittedWorkLink href={receipt.submittedWorkUrl} />}
  </div></div>
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function share(file: File) {
  if (await shareNativeReceipt(file)) return
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) return navigator.share({ title: 'HashPayStream receipt', files: [file] })
  download(file, file.name)
}

function dataUrlBlob(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) throw new Error('Receipt image could not be prepared.')
  return new Blob([Uint8Array.from(atob(match[2]), value => value.charCodeAt(0))], { type: match[1] })
}

function FullScreen({ receipt, surface, close }: { receipt: PaylinkReceipt; surface: Exclude<ReceiptSurface, null>; close: () => void }) {
  const [sharing, setSharing] = useState<'image' | 'pdf' | ''>('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const reference = paymentReceiptView(receipt).reference
  useEffect(() => { const prior = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prior } }, [])
  async function shareReceipt(kind: 'image' | 'pdf') {
    if (sharing) return
    setSharing(kind); setError('')
    try {
      if (kind === 'image') { const blob = dataUrlBlob(await createPaymentReceiptImage(receipt)); await share(new File([blob], paymentReceiptImageFileName(receipt), { type: 'image/jpeg' })) }
      else { const blob = await createPaymentReceiptPdf(receipt); await share(new File([blob], paymentReceiptFileName(receipt), { type: 'application/pdf' })) }
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : 'Receipt could not be shared.') }
    finally { setSharing('') }
  }
  return createPortal(<div className="fixed inset-0 z-[180] flex flex-col overflow-hidden bg-[#F5F5F7] pt-[env(safe-area-inset-top)] text-gray-950 dark:bg-[#0A0A0A] dark:text-white" role="dialog" aria-modal="true" aria-label={surface === 'details' ? 'Transaction details' : 'Receipt preview'}>
    <div className="z-10 shrink-0 border-b border-gray-200/80 bg-[#F5F5F7]/95 px-4 backdrop-blur dark:border-white/10 dark:bg-[#0A0A0A]/95"><div className="mx-auto grid h-14 max-w-lg grid-cols-[48px_1fr_48px] items-center"><span /><h1 className="text-center text-sm font-bold">{surface === 'details' ? 'Transaction details' : 'Receipt'}</h1><button type="button" onClick={close} className="inline-flex h-11 items-center justify-end text-xs font-bold">Done</button></div></div>
    {surface === 'details' ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><TransactionDetails receipt={receipt} copied={copied} copy={() => void navigator.clipboard.writeText(reference).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) })} /></div> : <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2"><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[28px] border border-gray-100 bg-white shadow-sm"><ReceiptDocument receipt={receipt} /></div><div className="mt-2 grid shrink-0 grid-cols-2 gap-2"><button type="button" disabled={Boolean(sharing)} onClick={() => void shareReceipt('image')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-bold disabled:opacity-60 dark:border-white/10 dark:bg-white/[.08]"><ShareIcon className="h-4 w-4" />{sharing === 'image' ? 'Preparing' : 'Share image'}</button><button type="button" disabled={Boolean(sharing)} onClick={() => void shareReceipt('pdf')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-60 dark:bg-white dark:text-gray-950"><ShareIcon className="h-4 w-4" />{sharing === 'pdf' ? 'Preparing' : 'Share PDF'}</button></div>{error && <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-500">{error}</p>}</div>}
  </div>, document.body)
}

export default function UnifiedReceipt({ receipt: sourceReceipt, settlement, submittedWorkUrl, className = '', label = 'View details', showAction = true, compact = false }: UnifiedReceiptProps) {
  const [surface, setSurface] = useState<ReceiptSurface>(null)
  const [error, setError] = useState('')
  const receipt = sourceReceipt ? { ...sourceReceipt, split: settlement ?? sourceReceipt.split, submittedWorkUrl: submittedWorkUrl ?? sourceReceipt.submittedWorkUrl } : undefined
  if (!showAction) return null
  function open(next: Exclude<ReceiptSurface, null>) { setError(''); if (!receipt) return setError('Receipt is not ready.'); setSurface(next) }
  const size = compact ? 'min-h-9 px-2.5 text-[11px]' : 'min-h-10 px-3 text-xs'
  return <div className={className}><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => open('details')} className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white font-bold text-gray-950 shadow-sm active:scale-[.99] dark:border-white/10 dark:bg-white/[.08] dark:text-white ${size}`}><EyeIcon className="h-3.5 w-3.5" />{label === 'Open receipt PDF' ? 'View details' : label}</button><button type="button" onClick={() => open('receipt')} className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-gray-950 font-bold text-white shadow-sm active:scale-[.99] dark:bg-white dark:text-gray-950 ${size}`}><ShareIcon className="h-3.5 w-3.5" />Share receipt</button></div>{error && <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-500">{error}</p>}{receipt && surface && <FullScreen receipt={receipt} surface={surface} close={() => setSurface(null)} />}</div>
}
