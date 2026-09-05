import assert from 'node:assert/strict'
import { paymentReceiptView, receiptUnits } from '../src/lib/paymentReceiptPdf.ts'
const split = {status:'completed',advanceUsdcUnits:'250000000',providerRemainderUsdcUnits:'190000000',providerTotalUsdcUnits:'440000000',funderRepaymentUsdcUnits:'300000000',funderProfitUsdcUnits:'50000000',platformFeeUsdcUnits:'10000000'}
const receipt = {receiptId:'synthetic',receiptHash:'',title:'Synthetic agreement',status:'completed',eventId:'synthetic',txHash:'',payer:'synthetic',amount:'500',asset:'USDC',createdAt:0,agreementStatus:'completed',releasedAmount:'500',split}
const values = r => Object.fromEntries(paymentReceiptView(r).rows.map(row=>[row.label,row.value]))
assert.equal(values(receipt)['Provider total'],'440 USDC')
assert.equal(values(receipt)['Partner received'],'300 USDC')
assert.equal(values(receipt)['HashPayStream fee'],'10 USDC')
assert.equal(values({...receipt,split:{...split,status:'received'}})['Payment split'],'Agreed split - repayment pending')
const refunded=values({...receipt,split:{...split,status:'refunded'}})
assert.equal(refunded['Funding returned'],'250 USDC')
assert.equal(refunded['Partner profit'],'0 USDC')
assert.equal(refunded['HashPayStream fee'],'0 USDC')
assert.equal(refunded['Partner received'],undefined)
assert.equal(refunded['Provider total'],undefined)
assert.equal(receiptUnits('9007199254740993123456'),'9007199254740993.123456 USDC')
assert.equal(receiptUnits('-1'),'-')
assert.equal(receiptUnits('invalid'),'-')
for (const [status,badge] of Object.entries({funded:'Funds protected',released:'Early payment sent',settled:'Payment completed',refunded:'Funding returned'})) {
  const view=paymentReceiptView({...receipt,type:'funding',fundingStatus:status,fundingRows:[{label:'Funded on X Layer',value:'250 USDC'}],referenceId:'position-proof'})
  assert.equal(view.badge,badge); assert.equal(view.reference,'position-proof'); assert.equal(view.rows.length,1)
}
console.log('Receipt split, refund, pending-state and precision checks passed.')
