import assert from 'node:assert/strict'
import { encodeEventTopics, encodeAbiParameters } from 'viem'
import {
  ARC_AGREEMENT_EVENTS,
  ERC20_TRANSFER_EVENT,
  REPAYMENT_EVENTS,
  verifyConfirmedReceipt,
} from '../api/chain-receipt-evidence.ts'

const escrow = '0x' + '11'.repeat(20)
const token = '0x' + '22'.repeat(20)
const payer = '0x' + '33'.repeat(20)
const agreementId = '0x' + '44'.repeat(32)
const amount = '10000'
const activated = ARC_AGREEMENT_EVENTS.find(event => event.name === 'AgreementActivated')
const eventTopics = encodeEventTopics({ abi: [activated], eventName: 'AgreementActivated', args: { agreementId } })
const transferTopics = encodeEventTopics({ abi: [ERC20_TRANSFER_EVENT], eventName: 'Transfer', args: { from: payer, to: escrow } })
const receipt = {
  status: 'success',
  transactionHash: '0x' + '55'.repeat(32),
  blockNumber: 100n,
  blockHash: '0x' + '66'.repeat(32),
  logs: [
    { address: escrow, topics: eventTopics, data: encodeAbiParameters([{ type: 'uint256' }], [10_000n]), logIndex: 2 },
    { address: token, topics: transferTopics, data: encodeAbiParameters([{ type: 'uint256' }], [10_000n]), logIndex: 1 },
  ],
}
const expected = {
  network: 'arc-testnet', chainId: 5_042_002, contractAddress: escrow, tokenAddress: token,
  eventName: 'AgreementActivated', identityField: 'agreementId', identity: agreementId,
  expectedBlockNumber: 100n, headBlockNumber: 103n, minimumConfirmations: 3,
  eventAmounts: { amount }, transfers: [{ from: payer, to: escrow, amountUnits: amount }],
}
const verified = verifyConfirmedReceipt(receipt, expected)
assert.equal(verifyConfirmedReceipt(receipt, { ...expected, expectedBlockHash: receipt.blockHash }).verified, true)
assert.deepEqual(verifyConfirmedReceipt(receipt, { ...expected, expectedBlockHash: '0x' + '99'.repeat(32) }).codes, ['BLOCK_HASH_MISMATCH'])
assert.equal(verified.verified, true)
assert.deepEqual(verified.codes, [])
assert.equal(verified.confirmations, '4')
assert.equal(verified.logIndex, 2)
assert.match(verified.payloadHash, /^[a-f0-9]{64}$/)
assert.equal(
  verifyConfirmedReceipt(receipt, { ...expected, headBlockNumber: 1_000n }).payloadHash,
  verified.payloadHash,
)
assert.equal(
  verifyConfirmedReceipt(receipt, { ...expected, identity: agreementId.toUpperCase().replace('0X', '0x') }).verified,
  true,
)

assert.deepEqual(
  verifyConfirmedReceipt({ ...receipt, status: 'reverted' }, expected).codes,
  ['TRANSACTION_REVERTED'],
)
assert.deepEqual(
  verifyConfirmedReceipt(receipt, { ...expected, headBlockNumber: 100n, minimumConfirmations: 2 }).codes,
  ['CONFIRMATIONS_INSUFFICIENT'],
)
assert.deepEqual(
  verifyConfirmedReceipt(receipt, { ...expected, eventAmounts: { amount: '9999' } }).codes,
  ['EVENT_AMOUNT_MISMATCH'],
)
assert.deepEqual(
  verifyConfirmedReceipt(receipt, { ...expected, transfers: [{ from: payer, to: escrow, amountUnits: '9999' }] }).codes,
  ['TOKEN_TRANSFER_MISSING'],
)
assert.deepEqual(
  verifyConfirmedReceipt(receipt, { ...expected, transfers: [expected.transfers[0], expected.transfers[0]] }).codes,
  ['TOKEN_TRANSFER_MISSING'],
)
assert.deepEqual(
  verifyConfirmedReceipt(receipt, { ...expected, contractAddress: '0x' + '77'.repeat(20) }).codes,
  ['CONTRACT_EVENT_MISSING'],
)
assert.deepEqual(
  verifyConfirmedReceipt({ ...receipt, logs: [...receipt.logs, { ...receipt.logs[0], logIndex: 3 }] }, expected).codes,
  ['CONTRACT_EVENT_AMBIGUOUS'],
)

console.log('HashPayStream confirmed chain receipt evidence checks passed.')

const arcTermsHash = '0x' + 'aa'.repeat(32)
const fundingTermsHash = '0x' + 'bb'.repeat(32)
const provider = '0x' + '77'.repeat(20)
const treasury = '0x' + '88'.repeat(20)
const splitTransfers = [
  { from: escrow, to: payer, amountUnits: '5000' },
  { from: escrow, to: provider, amountUnits: '4000' },
  { from: escrow, to: treasury, amountUnits: '1000' },
]
const splitReceipt = { ...receipt, logs: [
  { address: escrow, logIndex: 0,
    topics: encodeEventTopics({ abi: REPAYMENT_EVENTS, eventName: 'RepaymentSettled', args: { arcAgreementHash: agreementId, arcTermsHash, funder: payer } }),
    data: encodeAbiParameters([{type:'address'}, {type:'address'}, {type:'uint256'}, {type:'uint256'}, {type:'uint256'}], [provider, treasury, 5000n, 4000n, 1000n]),
  },
  ...splitTransfers.map((transfer, index) => ({ address: token, logIndex: index + 1,
    topics: encodeEventTopics({ abi: [ERC20_TRANSFER_EVENT], eventName: 'Transfer', args: {from: transfer.from, to: transfer.to} }),
    data: encodeAbiParameters([{type:'uint256'}], [BigInt(transfer.amountUnits)]),
  })),
] }
const splitExpected = { ...expected, eventName: 'RepaymentSettled', identityField: 'arcAgreementHash',
  eventAmounts: {funderAmount:'5000', providerAmount:'4000', treasuryAmount:'1000'},
  eventAddresses: {funder:payer, provider, treasury}, eventHashes: {arcTermsHash}, transfers:splitTransfers,
}
assert.equal(verifyConfirmedReceipt(splitReceipt, splitExpected).verified, true)
assert.deepEqual(verifyConfirmedReceipt(splitReceipt, {...splitExpected, eventHashes:{arcTermsHash:fundingTermsHash}}).codes, ['EVENT_HASH_MISMATCH'])
console.log('Arc repayment verifies its own terms hash independently of the funding commitment.')