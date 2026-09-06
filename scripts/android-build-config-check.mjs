const required = [
  'VITE_PRIVY_APP_ID',
  'VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET',
  'VITE_HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED',
  'VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID',
  'VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS',
  'VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS',
  'VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED',
]

const missing = required.filter(name => !String(process.env[name] ?? '').trim())

if (missing.length) {
  console.error(`Android build stopped: missing public client configuration: ${missing.join(', ')}`)
  console.error('Load the verified deployment VITE_* values into this shell, then rebuild.')
  process.exit(1)
}

const expected = {
  VITE_HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: 'true',
  VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID: '196',
  VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED: 'true',
}
const invalid = Object.entries(expected)
  .filter(([name, value]) => String(process.env[name] ?? '').trim().toLowerCase() !== value)
  .map(([name]) => name)
for (const name of ['VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS', 'VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS']) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(process.env[name] ?? '').trim())) invalid.push(name)
}
if (invalid.length) {
  console.error(`Android build stopped: invalid production public configuration: ${invalid.join(', ')}`)
  process.exit(1)
}

console.log('Android production public client configuration is present.')
