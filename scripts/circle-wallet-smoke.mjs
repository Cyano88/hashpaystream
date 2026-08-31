import assert from 'node:assert/strict'
import { createCircleWalletHandler, readArcUsdcBalance } from '../api/circle-wallet.ts'

const wallet = { id: 'wallet-arc', address: '0x1111111111111111111111111111111111111111', blockchain: 'ARC-TESTNET', accountType: 'SCA', state: 'LIVE' }
const recipient = '0x2222222222222222222222222222222222222222'
const challengeId = 'challenge_abc123'
const transactionId = '11111111-1111-4111-8111-111111111111'
const calls = []
const rpcHosts = []
let balanceReads = 0
const originalFetch = globalThis.fetch

globalThis.fetch = async (url, init = {}) => {
  const parsedUrl = new URL(String(url))
  if (parsedUrl.hostname === 'unavailable.example') {
    rpcHosts.push(parsedUrl.hostname)
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }
  if (parsedUrl.hostname === 'rpc.testnet.arc.network') {
    rpcHosts.push(parsedUrl.hostname)
    const rpcBody = JSON.parse(String(init.body))
    return Response.json({ jsonrpc: '2.0', id: rpcBody.id, result: '0x0000000000000000000000000000000000000000000000000000000003eef580' })
  }
  const path = parsedUrl.pathname
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  calls.push({ path, init, body })
  if (path === '/v1/w3s/users/email/token') return Response.json({ data: { deviceToken: 'device-token', deviceEncryptionKey: 'device-key', otpToken: 'otp-token' } })
  if (path === '/v1/w3s/users/token/refresh') return Response.json({ data: { userToken: 'refreshed-user-token', encryptionKey: 'refreshed-key', refreshToken: 'rotated-refresh-token' } })
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
  const publicFallbackBalance = await readArcUsdcBalance(wallet.address, { HASHPAYSTREAM_ARC_RPC_URL: 'https://unavailable.example' })
  assert.equal(publicFallbackBalance, 65_992_064n)
  assert.equal(rpcHosts.at(-1), 'rpc.testnet.arc.network')
  assert.ok(rpcHosts.slice(0, -1).every(host => host === 'unavailable.example'))
  const handler = createCircleWalletHandler({ env: () => ({ CIRCLE_TEST_API_KEY: 'TEST_API_KEY' }), identity: async () => 'member@example.com', balance: async address => {
    assert.equal(address, wallet.address)
    balanceReads += 1
    if (balanceReads > 1) throw new Error('temporary rpc failure')
    return 65_992_064n
  } })
  const otp = await call(handler, { action: 'request_email_otp', email: 'member@example.com', deviceId: 'device-id' })
  assert.equal(otp.statusCode, 200)
  assert.equal(otp.body.deviceToken, 'device-token')
  const wrongEmail = await call(handler, { action: 'request_email_otp', email: 'other@example.com', deviceId: 'device-id' })
  assert.equal(wrongEmail.statusCode, 403)
  const refreshed = await call(handler, { action: 'refresh_session', userToken: 'user-token', refreshToken: 'refresh-token', deviceId: 'device-id' })
  assert.equal(refreshed.statusCode, 200)
  assert.equal(refreshed.body.userToken, 'refreshed-user-token')
  const refreshCall = calls.find(item => item.path.endsWith('/users/token/refresh'))
  assert.equal(refreshCall.init.headers['x-user-token'], 'user-token')
  assert.equal(refreshCall.body.refreshToken, 'refresh-token')
  const listed = await call(handler, { action: 'list_wallets', userToken: 'user-token' })
  assert.equal(listed.body.wallet.id, wallet.id)
  assert.equal(listed.body.wallets.length, 1)
  const circleCallsBeforeBalance = calls.length
  const balance = await call(handler, { action: 'get_balance', userToken: 'user-token', walletId: wallet.id, walletAddress: wallet.address })
  assert.equal(balance.statusCode, 200)
  assert.equal(balance.body.balanceUsdcUnits, '65992064')
  assert.equal(balance.body.stale, false)
  assert.equal(calls.length, circleCallsBeforeBalance, 'Public Arc balance reads must not depend on Circle wallet-list availability')
  const cachedBalance = await call(handler, { action: 'get_balance', userToken: 'user-token', walletId: wallet.id, walletAddress: wallet.address })
  assert.equal(cachedBalance.statusCode, 200)
  assert.equal(cachedBalance.body.balanceUsdcUnits, '65992064')
  assert.equal(cachedBalance.body.stale, true)
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
