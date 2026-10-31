export type UpfrontEscrowVersion = '1' | '2'

// The fee-agreement schema remains V3; these are the contract signature domains.
export function upfrontProtocol(value: unknown = '1'): { escrowVersion: UpfrontEscrowVersion; repaymentVersion: '3' | '4' } {
  const escrowVersion = String(value).trim()
  if (escrowVersion !== '1' && escrowVersion !== '2') {
    throw Object.assign(new Error('Unsupported Upfront contract signature version.'), { status: 503 })
  }
  return { escrowVersion, repaymentVersion: escrowVersion === '2' ? '4' as const : '3' as const }
}
