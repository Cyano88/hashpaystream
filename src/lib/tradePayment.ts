function fail(message: string): never { throw Object.assign(Error(message), { status: 400 }) }
export type TradePaymentRail = 'arc' | 'xlayer'
export const ARC_TRADE_USDC = '0x3600000000000000000000000000000000000000' as const
type PaymentTerms = {
  currency: string; settlementAsset?: string; settlementToken?: string
  paymentRail?: TradePaymentRail
}
// Never infer mainnet from historical USDC-only terms. Re-propose and accept
// terms with an explicit Arc rail before creating a new mainnet reservation.
export function tradePayment(terms: PaymentTerms) {
  if (terms.paymentRail !== undefined && terms.paymentRail !== 'arc' && terms.paymentRail !== 'xlayer') fail('Choose a supported Trade payment network.')
  if (terms.paymentRail === 'arc') {
    if (terms.currency !== 'USDC' || terms.settlementAsset !== 'USDC'
      || (terms.settlementToken !== undefined && (typeof terms.settlementToken !== 'string' || terms.settlementToken.toLowerCase() !== ARC_TRADE_USDC.toLowerCase()))) fail('Arc Trade must use USDC on Arc mainnet.')
    return { rail:'arc' as const,chainId:5042 as const,token:ARC_TRADE_USDC,decimals:6 as const,policy:'trade-arc-usdc-v1' as const }
  }
  if (terms.currency === 'XLAYER_ASSET' && terms.settlementAsset === 'XLAYER_TOKENIZED_ASSET') {
    if (!terms.settlementToken || !/^0x[0-9a-fA-F]{40}$/.test(terms.settlementToken) || /^0x0{40}$/i.test(terms.settlementToken)) fail('Choose a supported stock.')
    return { rail:'xlayer' as const,chainId:196 as const,token:terms.settlementToken,policy:'xstocks-shares-v2' as const }
  }
  if (terms.paymentRail === 'xlayer') fail('XLayer Trade must use a supported stock.')
  fail('Accept an explicit payment network before opening checkout.')
}
export function tradeTermsDecimals(terms: PaymentTerms): number {
  return terms.currency === 'XLAYER_ASSET' ? 18 : terms.paymentRail === 'arc' ? 6 : 2
}
