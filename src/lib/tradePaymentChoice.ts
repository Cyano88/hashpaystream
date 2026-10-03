import type {TradeTerms} from './tradeAgreement'
import {ARC_TRADE_USDC,type TradePaymentRail} from './tradePayment'
export type TradeRailAvailability={arc:boolean;xlayer:boolean}
export function tradePaymentChoice(terms:TradeTerms):TradePaymentRail|'legacy'{
  return terms.paymentRail==='arc'?'arc':terms.currency==='XLAYER_ASSET'?'xlayer':'legacy'
}
export function chooseTradePayment(terms:TradeTerms,rail:TradePaymentRail,available:TradeRailAvailability):TradeTerms{
  if(!['arc','xlayer'].includes(rail)||!available[rail])throw Error('This payment network is currently unavailable.')
  // Prices are quantities of different assets. Never carry a quote across rails.
  return {...terms,paymentRail:rail,currency:rail==='arc'?'USDC':'XLAYER_ASSET',settlementAsset:rail==='arc'?'USDC':'XLAYER_TOKENIZED_ASSET',
    settlementToken:rail==='arc'?ARC_TRADE_USDC:undefined,price:'',deliveryFee:'0'}
}
