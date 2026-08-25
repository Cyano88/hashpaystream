import assert from 'node:assert/strict'
import { encodeFunctionData } from 'viem'
import { createStreamAccountsHandler } from '../api/stream-accounts.ts'

const ownerWallet = '0x1111111111111111111111111111111111111111'
const recipientWallet = '0x2222222222222222222222222222222222222222'
const usdc = '0x3600000000000000000000000000000000000000'
const txHash = `0x${'ab'.repeat(32)}`
const transferInput = encodeFunctionData({
  abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
  functionName: 'transfer', args: [recipientWallet, 1_250_000n],
})

function responseRecorder() {
  return { statusCode: 200, body: undefined, headers: {}, setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}
async function call(handler, { method = 'GET', token = 'owner', body, query = {} } = {}) {
  const response = responseRecorder()
  await handler({ method, headers: { authorization: `Bearer ${token}` }, body, query }, response)
  return response
}

let store
const identities = {
  owner: { email: 'owner@example.com', emails: ['owner@example.com'], wallets: [ownerWallet] },
  recipient: { email: 'recipient@example.com', emails: ['recipient@example.com'], wallets: [recipientWallet] },
}
const handler = createStreamAccountsHandler({
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => { store = await update(store); return store },
  identity: async req => identities[req.headers.authorization.replace('Bearer ', '')],
  transaction: async hash => {
    assert.equal(hash, txHash)
    return { from: ownerWallet, to: usdc, input: transferInput, success: true }
  },
  env: () => ({ HASHPAYSTREAM_APP_OWNERSHIP_SECRET: 's'.repeat(48), HASHPAYSTREAM_ACCOUNT_STORE_KEY: 'accounts-test' }),
  now: () => new Date('2026-08-25T12:00:00.000Z'),
  id: () => 'txa_11111111-1111-4111-8111-111111111111',
})

const owner = await call(handler)
const recipient = await call(handler, { token: 'recipient' })
assert.match(owner.body.profile.pocketId, /^\d{10}$/)
assert.match(recipient.body.profile.pocketId, /^\d{10}$/)
assert.notEqual(owner.body.profile.pocketId, recipient.body.profile.pocketId)
assert.equal(owner.body.profile.walletAddress, ownerWallet)

const resolved = await call(handler, { method: 'POST', body: { action: 'resolve_pocket_id', pocketId: recipient.body.profile.pocketId } })
assert.equal(resolved.statusCode, 200)
assert.equal(resolved.body.recipient.walletAddress, recipientWallet)
assert.equal(resolved.body.recipient.email, undefined)

const recorded = await call(handler, { method: 'POST', body: { action: 'record_transfer', txHash } })
assert.equal(recorded.statusCode, 201)
assert.equal(recorded.body.transfer.amountUsdcUnits, '1250000')

const ownerActivity = await call(handler, { query: { view: 'activity' } })
const recipientActivity = await call(handler, { token: 'recipient', query: { view: 'activity' } })
assert.equal(ownerActivity.body.activity[0].direction, 'sent')
assert.equal(recipientActivity.body.activity[0].direction, 'received')
assert.equal(recipientActivity.body.activity[0].counterpartyPocketId, owner.body.profile.pocketId)

const self = await call(handler, { method: 'POST', body: { action: 'resolve_pocket_id', pocketId: owner.body.profile.pocketId } })
assert.equal(self.statusCode, 409)
const invalid = await call(handler, { method: 'POST', body: { action: 'resolve_pocket_id', pocketId: '123' } })
assert.equal(invalid.statusCode, 400)

console.log('HashPayStream account, Pocket ID, and confirmed transfer checks passed.')
