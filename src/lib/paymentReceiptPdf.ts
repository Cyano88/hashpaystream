export type PaylinkReceipt = {
  type?: string
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

function rows(receipt: PaylinkReceipt): UnifiedReceiptRow[] {
  return [
    { label: 'Agreement', value: receipt.narration || receipt.title || '-' },
    { label: 'Type', value: template(receipt.agreementTemplate) },
    { label: 'Payer', value: receipt.payer || '-', mono: true },
    { label: 'Recipient', value: receipt.recipient || '-', mono: true },
    { label: 'Protected by', value: receipt.escrowAddress || receipt.destination || '-', mono: true },
    { label: 'Outcome', value: outcome(receipt) },
    { label: 'Agreement ID', value: receipt.agreementId || receipt.eventId, mono: true },
  ]
}

export function paymentReceiptView(receipt: PaylinkReceipt): UnifiedReceiptView {
  const reversed = receipt.agreementStatus === 'refunded' || receipt.agreementStatus === 'cancelled'
  return {
    badge: reversed ? 'USDC returned' : receipt.agreementStatus === 'completed' ? 'Completed' : 'Confirmed',
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

function receiptCanvas(receipt: PaylinkReceipt) {
  const width = 612
  const height = 792
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Receipt renderer is unavailable.')
  ctx.scale(2, 2)
  drawReceipt(ctx, receipt, width, height)
  return { canvas, width, height }
}

export async function createPaymentReceiptImage(receipt: PaylinkReceipt) {
  return receiptCanvas(receipt).canvas.toDataURL('image/jpeg', 0.94)
}

export async function createPaymentReceiptPdf(receipt: PaylinkReceipt) {
  const { canvas, width, height } = receiptCanvas(receipt)
  const jpeg = await new Promise<string>((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) return reject(new Error('Receipt PDF could not be prepared.'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Receipt PDF could not be prepared.'))
    reader.readAsDataURL(blob)
  }, 'image/jpeg', 0.94))
  return pdfFromJpeg(jpeg, width, height, arcTransactionUrl(receipt))
}

function drawReceipt(ctx: CanvasRenderingContext2D, receipt: PaylinkReceipt, width: number, height: number) {
  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, width, height)
  roundRect(ctx, 34, 32, width - 68, height - 64, 28, '#000000')

  // Canvas-native HashPayStream mark: crisp at every PDF zoom level and no background tile.
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(78, 75, 14, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(78, 75, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 17px Arial'
  ctx.fillText('HashPayStream', 108, 81)
  badge(ctx, 'ARC AGREEMENT', 418, 62)

  ctx.font = '800 36px Arial'
  ctx.fillText(`${amount(receipt.amount)} ${receipt.asset || 'USDC'}`, 62, 158)
  ctx.fillStyle = '#8c8c8c'
  ctx.font = '600 12px Arial'
  ctx.fillText(timestamp(receipt.createdAt), 62, 184)
  divider(ctx, 218)

  let y = 254
  for (const row of rows(receipt)) {
    ctx.fillStyle = '#8c8c8c'
    ctx.font = '600 11px Arial'
    ctx.fillText(row.label.toUpperCase(), 62, y)
    ctx.fillStyle = '#ffffff'
    ctx.font = row.mono ? '700 12px Courier New' : '700 13px Arial'
    rightText(ctx, shorten(row.value), 550, y, 320)
    divider(ctx, y + 24)
    y += 57
  }

  ctx.fillStyle = '#8c8c8c'
  ctx.font = '600 11px Arial'
  ctx.fillText('REFERENCE ID', 62, y + 2)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 12px Courier New'
  rightText(ctx, shorten(receipt.txHash || receipt.receiptHash || receipt.receiptId), 550, y + 2, 320)
  if (arcTransactionUrl(receipt)) {
    ctx.fillStyle = '#a3a3a3'
    ctx.font = '700 9px Arial'
    rightText(ctx, 'VIEW ON ARC EXPLORER', 550, y + 20, 320)
  }

  ctx.setLineDash([])
  ctx.fillStyle = '#707070'
  ctx.font = '700 10px Arial'
  const footer = 'VERIFIED ARC AGREEMENT RECORD | HASHPAYSTREAM | POWERED BY HASH PAYLINK'
  ctx.fillText(footer, (width - ctx.measureText(footer).width) / 2, 746)
}

function divider(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = '#2f2f2f'
  ctx.setLineDash([2, 6])
  ctx.beginPath()
  ctx.moveTo(62, y)
  ctx.lineTo(550, y)
  ctx.stroke()
}

function shorten(value: string) {
  if (!value) return '-'
  if (value.length <= 34) return value
  if (value.startsWith('0x')) return `${value.slice(0, 10)}...${value.slice(-8)}`
  return `${value.slice(0, 22)}...${value.slice(-8)}`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fillStyle = fill
  ctx.fill()
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  roundRect(ctx, x, y, 108, 26, 13, '#171717')
  ctx.fillStyle = '#f5f5f5'
  ctx.font = '800 9px Arial'
  ctx.fillText(text, x + 12, y + 17)
}

function rightText(ctx: CanvasRenderingContext2D, value: string, right: number, y: number, maxWidth: number) {
  let clipped = value
  while (clipped.length > 4 && ctx.measureText(clipped).width > maxWidth) clipped = `${clipped.slice(0, -4)}...`
  ctx.fillText(clipped, right - ctx.measureText(clipped).width, y)
}

function escapePdfLiteral(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function pdfFromJpeg(dataUrl: string, width: number, height: number, transactionUrl: string) {
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
    start(6); add(`<< /Type /Annot /Subtype /Link /Rect [300 110 550 153] /Border [0 0 0] /A << /S /URI /URI (${escapePdfLiteral(transactionUrl)}) >> >>\nendobj\n`)
  }
  const xref = offset
  const objectCount = transactionUrl ? 7 : 6
  add(`xref\n0 ${objectCount}\n0000000000 65535 f \n`)
  for (let id = 1; id < objectCount; id += 1) add(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parts, { type: 'application/pdf' })
}
