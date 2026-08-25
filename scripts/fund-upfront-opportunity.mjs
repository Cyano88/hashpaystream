import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createPublicClient, createWalletClient, getAddress, hashTypedData, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const ESCROW_ABI = [
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'fundAdvance', stateMutability: 'nonpayable', inputs: [
    { name: 'offer', type: 'tuple', components: [
      { name: 'provider', type: 'address' }, { name: 'termsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' },
      { name: 'protectedAmount', type: 'uint256' }, { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
      { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
    ] },
    { name: 'advanceAmount', type: 'uint256' }, { name: 'repaymentRecipient', type: 'address' }, { name: 'underwritingSignature', type: 'bytes' },
  ], outputs: [{ name: 'positionId', type: 'bytes32' }] },
]
const ERC20_ABI = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }]
const TYPES = { UnderwritingOffer: [
  { name: 'provider', type: 'address' }, { name: 'termsHash', type: 'bytes32' }, { name: 'intelligenceCommitment', type: 'bytes32' },
  { name: 'protectedAmount', type: 'uint256' }, { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
  { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] }

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function units(value) {
  const text = String(value ?? '').trim()
  if (!/^[1-9]\d{0,30}$/.test(text)) throw new Error('The opportunity advance amount is invalid.')
  return BigInt(text)
}

function offerMessage(value) {
  if (!value || typeof value !== 'object') throw new Error('The signed underwriting offer is missing.')
  return {
    provider: getAddress(value.provider), termsHash: value.termsHash, intelligenceCommitment: value.intelligenceCommitment,
    protectedAmount: BigInt(value.protectedAmount), maxAdvanceBps: Number(value.maxAdvanceBps),
    protectionDeadline: Number(value.protectionDeadline), underwritingDeadline: Number(value.underwritingDeadline), nonce: value.nonce,
  }
}

const file = process.argv.find(value => value.endsWith('.json'))
if (!file) throw new Error('Usage: npm run upfront:fund -- ./verified-offer.json [--execute]')
const execute = process.argv.includes('--execute')
const payload = JSON.parse(await readFile(file, 'utf8'))
const signed = payload.onchainOffer
if (!signed || signed.primaryType !== 'UnderwritingOffer') throw new Error('The copied PolyDesk offer is invalid.')
const escrow = getAddress(required('HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS'))
const expectedChainId = Number(required('HASHPAYSTREAM_UPFRONT_CHAIN_ID'))
if (![1952, 196].includes(expectedChainId)) throw new Error('Only X Layer testnet 1952 or mainnet 196 is supported.')
if (Number(signed.domain?.chainId) !== expectedChainId || getAddress(signed.domain?.verifyingContract) !== escrow) throw new Error('The offer does not target the configured X Layer escrow.')
if (signed.domain?.name !== 'HashPayStream Upfront' || signed.domain?.version !== '1') throw new Error('The offer EIP-712 domain is invalid.')
const message = offerMessage(signed.message)
const advanceAmount = units(payload.advanceAmountUsdcUnits)
const maximum = message.protectedAmount * BigInt(message.maxAdvanceBps) / 10_000n
if (advanceAmount > maximum) throw new Error('The requested funding exceeds the signed PolyDesk maximum.')
if (!/^0x[a-fA-F0-9]{130}$/.test(String(signed.signature ?? ''))) throw new Error('The PolyDesk EIP-712 signature is invalid.')
const positionId = hashTypedData({ domain: { name: 'HashPayStream Upfront', version: '1', chainId: expectedChainId, verifyingContract: escrow }, types: TYPES, primaryType: 'UnderwritingOffer', message })
const funderPrivateKey = String(process.env.XLAYER_FUNDER_PRIVATE_KEY ?? '').trim()
if (funderPrivateKey && !/^0x[a-fA-F0-9]{64}$/.test(funderPrivateKey)) throw new Error('XLAYER_FUNDER_PRIVATE_KEY is invalid.')
const account = funderPrivateKey ? privateKeyToAccount(funderPrivateKey) : undefined
const rpcUrl = String(process.env.HASHPAYSTREAM_XLAYER_RPC_URL ?? (expectedChainId === 196 ? 'https://rpc.xlayer.tech' : 'https://testrpc.xlayer.tech/terigon')).trim()
const publicClient = createPublicClient({ transport: http(rpcUrl) })
const chainId = await publicClient.getChainId()
if (chainId !== expectedChainId) throw new Error(`Refusing X Layer RPC chain ${chainId}; expected ${expectedChainId}.`)
const asset = await publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: 'asset' })

console.log(JSON.stringify({ execute, chainId, escrow, asset, positionId, agreementId: payload.agreementId, requestId: payload.requestId, advanceAmountUsdcUnits: advanceAmount.toString(), provider: message.provider, repaymentRecipient: account?.address ?? 'derived from the funding wallet during execution' }, null, 2))
if (!execute) {
  console.log(`Dry run only. Re-run with --execute and HASHPAYSTREAM_UPFRONT_FUND_CONFIRM=${expectedChainId === 196 ? 'FUND_XLAYER_MAINNET' : 'FUND_XLAYER_TESTNET'} to submit transactions.`)
  process.exit(0)
}
const confirmation = expectedChainId === 196 ? 'FUND_XLAYER_MAINNET' : 'FUND_XLAYER_TESTNET'
if (process.env.HASHPAYSTREAM_UPFRONT_FUND_CONFIRM !== confirmation) throw new Error(`Explicit X Layer funding confirmation ${confirmation} is missing.`)
if (!account) throw new Error('XLAYER_FUNDER_PRIVATE_KEY is required for execution.')
const wallet = createWalletClient({ account, transport: http(rpcUrl) })
const approve = await publicClient.simulateContract({ account, address: asset, abi: ERC20_ABI, functionName: 'approve', args: [escrow, advanceAmount] })
const approveHash = await wallet.writeContract(approve.request)
await publicClient.waitForTransactionReceipt({ hash: approveHash })
const funding = await publicClient.simulateContract({ account, address: escrow, abi: ESCROW_ABI, functionName: 'fundAdvance', args: [message, advanceAmount, account.address, signed.signature] })
if (funding.result !== positionId) throw new Error('The simulated X Layer position id does not match the signed offer.')
const fundingHash = await wallet.writeContract(funding.request)
const receipt = await publicClient.waitForTransactionReceipt({ hash: fundingHash })
if (receipt.status !== 'success') throw new Error('The X Layer funding transaction reverted.')
console.log(JSON.stringify({ ok: true, funder: account.address, positionId, approveHash, fundingHash, blockNumber: receipt.blockNumber.toString() }, null, 2))
