import assert from 'node:assert/strict'
import { createCircleWalletHandler } from '../api/circle-wallet.ts'

const wallet = { id: 'wallet-arc', address: '0x1111111111111111111111111111111111111111', blockchain: 'ARC-TESTNET', accountType: 'SCA', state: 'LIVE' }
const recipient = '0x2222222222222222222222222222222222222222'
const challengeId = 'challenge_abc123'
const transactionId = '11111111-1111-4111-8111-111111111111'
const calls = []
const originalFetch = globalThis.fetch

globalThis.fetch = async (url, init = {}) => {
  const path = new URL(String(url)).pathname
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  calls.push({ path, init, body })
  if (path === '/v1/w3s/users/email/token') return Response.json({ data: { deviceToken: 'device-token', deviceEncryptionKey: 'device-key', otpToken: 'otp-token' } })
  if (path === '/v1/w3s/wallets') return Response.json({ data: { wallets: [wallet, { ...wallet, id: 'wrong-chain', blockchain: 'ETH-SEPOLIA' }] } })
  if (path === '/v1/w3s/user/transactions/contractExecution') return Response.json({ data: { challengeId, transactionId } })
  if (path === `/v1/w3s/transactions/${transactionId}`) return Response.json({ data: { transaction: { id: transactionId, state: 'COMPLETE', txHash: `0x${'ab'.repeat(32)}` } } })
  return Response.json({ message: 'Unexpected Circle request' }, { status: 500 })
}

function responseRecorder() {
  return { statusCode: 200, body: undefined, headers: {}, setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}
async function call(handler, body) {
  const response = responseRecorder()
  await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body }, response)
  return response
}

try {
  const handler = createCircleWalletHandler({ env: () => ({ CIRCLE_TEST_API_KEY: 'TEST_API_KEY' }), identity: async () => 'member@example.com' })
  const otp = await call(handler, { action: 'request_email_otp', email: 'member@example.com', deviceId: 'device-id' })
  assert.equal(otp.statusCode, 200)
  assert.equal(otp.body.deviceToken, 'device-token')
  const wrongEmail = await call(handler, { action: 'request_email_otp', email: 'other@example.com', deviceId: 'device-id' })
  assert.equal(wrongEmail.statusCode, 403)
  const listed = await call(handler, { action: 'list_wallets', userToken: 'user-token' })
  assert.equal(listed.body.wallet.id, wallet.id)
  assert.equal(listed.body.wallets.length, 1)
  const send = await call(handler, { action: 'send_usdc', userToken: 'user-token', walletId: wallet.id, walletAddress: wallet.address, recipient, amountUnits: '1250000' })
  assert.equal(send.body.challengeId, challengeId)
  const contractCall = calls.find(item => item.path.endsWith('/contractExecution'))
  assert.equal(contractCall.body.walletId, wallet.id)
  assert.equal(contractCall.body.contractAddress, wallet.address)
  assert.match(contractCall.body.callData, /^0x[0-9a-f]+$/i)
  const transaction = await call(handler, { action: 'get_transaction', userToken: 'user-token', transactionId })
  assert.equal(transaction.body.transaction.txHash, `0x${'ab'.repeat(32)}`)
  assert.ok(calls.every(item => item.init.headers.authorization === 'Bearer TEST_API_KEY'))
  console.log('Circle Arc OTP, wallet ownership, transfer challenge, and transaction checks passed.')
} finally {
  globalThis.fetch = originalFetch
}
