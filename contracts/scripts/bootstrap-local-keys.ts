import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Wallet, getAddress, isAddress, ZeroAddress } from 'ethers'

const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) throw new Error('Refusing to replace the existing contracts/.env file.')

const xLayerOwnerInput = String(process.argv[2] ?? '').trim()
const arcOwnerInput = String(process.argv[3] ?? '').trim()
if (!isAddress(xLayerOwnerInput) || getAddress(xLayerOwnerInput) === ZeroAddress) {
  throw new Error('Pass the non-zero X Layer contract owner address as the first argument.')
}
if (!isAddress(arcOwnerInput) || getAddress(arcOwnerInput) === ZeroAddress) {
  throw new Error('Pass the non-zero Arc contract owner address as the second argument.')
}

const deployer = Wallet.createRandom()
const underwriting = Wallet.createRandom()
const protection = Wallet.createRandom()
const repayment = Wallet.createRandom()
const serviceToken = randomBytes(32).toString('hex')
const signingSecret = randomBytes(32).toString('hex')

const lines = [
  'XLAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon',
  'ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network',
  'ARC_TEST_USDC_ADDRESS=0x3600000000000000000000000000000000000000',
  'UPFRONT_XLAYER_CONTRACT_OWNER=' + getAddress(xLayerOwnerInput),
  'UPFRONT_ARC_CONTRACT_OWNER=' + getAddress(arcOwnerInput),
  'XLAYER_DEPLOYER_PRIVATE_KEY=' + deployer.privateKey,
  'ARC_DEPLOYER_PRIVATE_KEY=' + deployer.privateKey,
  'UPFRONT_UNDERWRITING_SIGNER=' + underwriting.address,
  'UPFRONT_PROTECTION_SIGNER=' + protection.address,
  'UPFRONT_REPAYMENT_CREDIT_SIGNER=' + repayment.address,
  'POLYDESK_UPFRONT_EIP712_PRIVATE_KEY=' + underwriting.privateKey,
  'POLYDESK_UPFRONT_SERVICE_TOKEN=' + serviceToken,
  'POLYDESK_UPFRONT_SIGNING_SECRET=' + signingSecret,
  'POLYDESK_UPFRONT_SIGNING_KEY_ID=polydesk-upfront-xlayer-testnet-v1',
  'HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY=' + protection.privateKey,
  'HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER=' + protection.address,
  'HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY=' + repayment.privateKey,
  'HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER=' + repayment.address,
  '',
]

writeFileSync(envPath, lines.join('\n'), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
chmodSync(envPath, 0o600)
console.log(JSON.stringify({
  envPath,
  xLayerOwner: getAddress(xLayerOwnerInput),
  arcOwner: getAddress(arcOwnerInput),
  deployer: deployer.address,
  underwritingSigner: underwriting.address,
  protectionSigner: protection.address,
  repaymentSigner: repayment.address,
}, null, 2))
