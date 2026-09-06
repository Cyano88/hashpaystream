import type { EarlyPaySettlement } from './serviceRequests'
export type PaylinkReceipt = {
  type?: string
  split?: EarlyPaySettlement
  submittedWorkUrl?: string
  fundingStatus?: 'funded' | 'released' | 'settled' | 'refunded'
  fundingRows?: UnifiedReceiptRow[]
  receiptId: string
  receiptHash: string
  title: string
  status: string
  eventId: string
  txHash: string
  chain?: string
  payer: string
  memo?: string
  amount: string
  asset: string
  createdAt: number
  source?: string
  settlementType?: string
  referenceId?: string
  recipient?: string
  destination?: string
  narration?: string
  agreementId?: string
  agreementStatus?: 'completed' | 'cancelled' | 'refunded'
  agreementTemplate?: string
  escrowAddress?: string
  releasedAmount?: string
  returnedAmount?: string
}

export type UnifiedReceiptRow = { label: string; value: string; mono?: boolean }
export type UnifiedReceiptView = {
  state: 'pending' | 'reversed' | 'successful'
  statusLabel: string
  badge: string
  amount: string
  timestamp: string
  rows: UnifiedReceiptRow[]
  reference: string
}

const ARC_TESTNET_EXPLORER_ORIGIN = 'https://testnet.arcscan.app'

export function arcTransactionUrl(receipt?: Pick<PaylinkReceipt, 'txHash'>) {
  const transactionHash = receipt?.txHash?.trim() ?? ''
  return /^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ? `${ARC_TESTNET_EXPLORER_ORIGIN}/tx/${transactionHash}`
    : ''
}

function amount(value?: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value || '0'
  return numeric.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

function timestamp(value?: number) {
  if (!value) return '-'
  return new Date(value).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function template(value?: string) {
  if (value === 'milestone') return 'Milestone agreement'
  if (value === 'progressive_release') return 'Progressive agreement'
  return 'Fixed agreement'
}

function outcome(receipt: PaylinkReceipt) {
  if (receipt.agreementStatus === 'completed') return `${amount(receipt.releasedAmount)} USDC released`
  return `${amount(receipt.returnedAmount)} USDC returned`
}

export function receiptUnits(units: string) {
  if (!/^\d+$/.test(units)) return '-'
  const value = BigInt(units), fraction = (value % 1000000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${value / 1000000n}${fraction ? '.' + fraction : ''} USDC`
}
function splitRows(receipt: PaylinkReceipt): UnifiedReceiptRow[] {
  const s = receipt.split
  if (!s) return []
  const complete = s.status === 'completed'
  const returned = s.status === 'refunded'
  if (returned) return [{label:'Payment split',value:'Funding returned'}, {label:'Funding returned',value:receiptUnits(s.advanceUsdcUnits)}, {label:'Partner profit',value:'0 USDC'}, {label:'HashPayStream fee',value:'0 USDC'}]
  return [
    {label:'Payment split',value: complete ? 'Payment completed' : 'Agreed split - repayment pending'},
    {label:'Early payment',value:receiptUnits(s.advanceUsdcUnits)},
    {label:complete ? 'Provider received later' : 'Provider receives later',value:receiptUnits(s.providerRemainderUsdcUnits)},
    {label:'Provider total',value:receiptUnits(s.providerTotalUsdcUnits)},
    {label:complete ? 'Partner received' : 'Partner receives',value:receiptUnits(s.funderRepaymentUsdcUnits)},
    {label:complete ? 'Partner earned' : 'Partner earns',value:receiptUnits(s.funderProfitUsdcUnits)},
    {label:'HashPayStream fee',value:receiptUnits(s.platformFeeUsdcUnits)},
  ]
}
function rows(receipt: PaylinkReceipt): UnifiedReceiptRow[] {
  if (receipt.type === 'funding') return receipt.fundingRows || []
  return [
    { label: 'Agreement', value: receipt.narration || receipt.title || '-' },
    { label: 'Type', value: template(receipt.agreementTemplate) },
    { label: 'Payer', value: receipt.payer || '-', mono: true },
    { label: 'Recipient', value: receipt.recipient || '-', mono: true },
    { label: 'Protected by', value: receipt.escrowAddress || receipt.destination || '-', mono: true },
    { label: 'Outcome', value: outcome(receipt) },
    { label: 'Agreement ID', value: receipt.agreementId || receipt.eventId, mono: true },
    ...splitRows(receipt),
  ]
}

export function paymentReceiptView(receipt: PaylinkReceipt): UnifiedReceiptView {
  const reversed = receipt.agreementStatus === 'refunded' || receipt.agreementStatus === 'cancelled'
  const state = receipt.fundingStatus === 'refunded' ? 'reversed' : receipt.fundingStatus === 'funded' || receipt.fundingStatus === 'released' ? 'pending' : reversed || ['refunded', 'reversed'].includes(receipt.status.trim().toLowerCase()) ? 'reversed' : ['pending', 'processing', 'settling', 'submitted', 'verification pending'].includes(receipt.status.trim().toLowerCase()) ? 'pending' : 'successful'
  return {
    state,
    statusLabel: receipt.fundingStatus ? ({funded:'Funds protected',released:'Early payment sent',settled:'Payment completed',refunded:'Funding returned'}[receipt.fundingStatus]) : state === 'pending' ? 'Payment pending' : state === 'reversed' ? 'Payment returned' : 'Payment completed',
    badge: receipt.fundingStatus ? ({funded:'Funds protected',released:'Early payment sent',settled:'Payment completed',refunded:'Funding returned'}[receipt.fundingStatus]) : reversed ? 'USDC returned' : receipt.agreementStatus === 'completed' ? 'Completed' : 'Confirmed',
    amount: `${amount(receipt.amount)} ${receipt.asset || 'USDC'}`,
    timestamp: timestamp(receipt.createdAt),
    rows: rows(receipt),
    reference: receipt.referenceId || receipt.txHash || receipt.receiptHash || receipt.receiptId,
  }
}

export function paymentReceiptBrand() {
  return { name: 'HashPayStream', imageUrl: '/brand/hashpaystream-mark.png' }
}

export function paymentReceiptFileName(receipt?: PaylinkReceipt) {
  return `hashpaystream-agreement-receipt-${receipt?.receiptId.slice(0, 10) || 'receipt'}.pdf`
}

export function paymentReceiptImageFileName(receipt?: PaylinkReceipt) {
  return `hashpaystream-agreement-receipt-${receipt?.receiptId.slice(0, 10) || 'receipt'}.jpg`
}

// One light document layout supplies both external formats, independent of app theme.
async function receiptCanvas(receipt: PaylinkReceipt) {
  await document.fonts.ready
  const logo = new Image()
  logo.src = paymentReceiptBrand().imageUrl
  await logo.decode()
  const view = paymentReceiptView(receipt)
  const width = 420, margin = 28, right = width - margin
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Receipt renderer is unavailable.')
  const wrap = (value: string, font: string, maxWidth: number) => {
    ctx.font = font
    const lines: string[] = []
    let line = ''
    for (const char of value || '-') {
      if (char === '\n' || (line && ctx.measureText(line + char).width > maxWidth)) {
        lines.push(line); line = char === '\n' ? '' : char
      } else line += char
    }
    if (line) lines.push(line)
    return lines
  }
  const rowLayout = view.rows.map(row => ({
    labels: wrap(row.label.toUpperCase(), '600 10px Arial', 134),
    values: wrap(row.value, row.mono ? '600 11px monospace' : '600 11px Arial', 210),
    mono: row.mono,
  }))
  const amountLines = wrap(view.amount, '700 30px Arial', width - margin * 2)
  const rowsY = 166 + amountLines.length * 36
  const referenceY = rowsY + rowLayout.reduce((sum, row) => sum + Math.max(row.labels.length, row.values.length) * 20 + 16, 0) + 24
  const referenceLines = wrap(view.reference, '600 10px monospace', width - margin * 2)
  const height = referenceY + 22 + referenceLines.length * 18 + 64
  canvas.width = width * 2; canvas.height = height * 2
  ctx.scale(2, 2)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
  ctx.drawImage(logo, margin, 20, 36, 36)
  ctx.fillStyle = '#030712'; ctx.font = '700 14px Arial'; ctx.fillText('HashPayStream', 76, 43)
  ctx.font = '700 9px Arial'
  const badgeText = view.badge.toUpperCase(), badgeWidth = ctx.measureText(badgeText).width + 20
  ctx.fillStyle = '#f3f4f6'; ctx.beginPath(); ctx.roundRect(right - badgeWidth, 25, badgeWidth, 26, 13); ctx.fill()
  ctx.fillStyle = '#6b7280'; ctx.fillText(badgeText, right - badgeWidth + 10, 42)
  // Standard 24 px badge with a 14 px glyph, inline with the status heading.
  ctx.fillStyle = view.state === 'reversed' ? '#f59e0b' : view.state === 'pending' ? '#2563eb' : '#10b981'
  ctx.beginPath(); ctx.arc(40, 90, 12, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath()
  if (view.state === 'successful') { ctx.moveTo(34, 90); ctx.lineTo(38, 94); ctx.lineTo(46, 86) }
  else if (view.state === 'pending') { ctx.arc(40, 90, 6, 0, Math.PI * 2); ctx.moveTo(40, 86); ctx.lineTo(40, 90); ctx.lineTo(43, 92) }
  else { ctx.arc(40, 90, 6, .5, 5.2); ctx.moveTo(43, 83); ctx.lineTo(43, 88); ctx.lineTo(48, 87) }
  ctx.stroke()
  ctx.fillStyle = '#030712'; ctx.font = '600 15px Arial'; ctx.fillText(view.statusLabel, 60, 95)
  ctx.fillStyle = '#9ca3af'; ctx.font = '500 11px Arial'; ctx.fillText(view.timestamp, margin, 120)
  ctx.fillStyle = '#030712'; ctx.font = '700 30px Arial'
  amountLines.forEach((line, index) => ctx.fillText(line, margin, 160 + index * 36))
  const divider = (y: number) => { ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(right, y); ctx.stroke() }
  divider(rowsY - 16)
  let y = rowsY
  for (const row of rowLayout) {
    ctx.fillStyle = '#9ca3af'; ctx.font = '600 10px Arial'
    row.labels.forEach((line, index) => ctx.fillText(line, margin, y + index * 20))
    ctx.fillStyle = '#374151'; ctx.font = row.mono ? '600 11px monospace' : '600 11px Arial'
    row.values.forEach((line, index) => ctx.fillText(line, right - ctx.measureText(line).width, y + index * 20))
    y += Math.max(row.labels.length, row.values.length) * 20 + 16
  }
  divider(referenceY - 20)
  ctx.fillStyle = '#9ca3af'; ctx.font = '600 10px Arial'; ctx.fillText('REFERENCE ID', margin, referenceY)
  ctx.fillStyle = '#4b5563'; ctx.font = '600 10px monospace'
  referenceLines.forEach((line, index) => ctx.fillText(line, margin, referenceY + 22 + index * 18))
  ctx.fillStyle = '#9ca3af'; ctx.font = '600 10px Arial'
  const footer = 'Powered by Hash PayLink'
  ctx.fillText(footer, (width - ctx.measureText(footer).width) / 2, height - 20)
  return { canvas, width, height, referenceY }
}

export async function createPaymentReceiptImage(receipt: PaylinkReceipt) {
  return (await receiptCanvas(receipt)).canvas.toDataURL('image/jpeg', 0.94)
}

export async function createPaymentReceiptPdf(receipt: PaylinkReceipt) {
  const { canvas, width, height, referenceY } = await receiptCanvas(receipt)
  return pdfFromJpeg(canvas.toDataURL('image/jpeg', 0.94), width, height, arcTransactionUrl(receipt), referenceY)
}

function escapePdfLiteral(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function pdfFromJpeg(dataUrl: string, width: number, height: number, transactionUrl: string, referenceY = 639) {
  const binary = atob(dataUrl.split(',')[1] || '')
  const image = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) image[index] = binary.charCodeAt(index)
  const encoder = new TextEncoder()
  const parts: BlobPart[] = []
  const offsets: number[] = [0]
  let offset = 0
  const add = (part: string | ArrayBuffer) => { parts.push(part); offset += typeof part === 'string' ? encoder.encode(part).length : part.byteLength }
  const start = (id: number) => { offsets[id] = offset; add(`${id} 0 obj\n`) }
  const stream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im1 Do\nQ`
  add('%PDF-1.4\n')
  start(1); add('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  start(2); add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  const annotations = transactionUrl ? ' /Annots [6 0 R]' : ''
  start(3); add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R${annotations} >>\nendobj\n`)
  start(4); add(`<< /Type /XObject /Subtype /Image /Width ${width * 2} /Height ${height * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.byteLength} >>\nstream\n`); add(image.buffer.slice(0) as ArrayBuffer); add('\nendstream\nendobj\n')
  start(5); add(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream\nendobj\n`)
  if (transactionUrl) {
    start(6); add(`<< /Type /Annot /Subtype /Link /Rect [28 48 ${width - 28} ${height - referenceY + 12}] /Border [0 0 0] /A << /S /URI /URI (${escapePdfLiteral(transactionUrl)}) >> >>\nendobj\n`)
  }
  const xref = offset
  const objectCount = transactionUrl ? 7 : 6
  add(`xref\n0 ${objectCount}\n0000000000 65535 f \n`)
  for (let id = 1; id < objectCount; id += 1) add(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parts, { type: 'application/pdf' })
}
