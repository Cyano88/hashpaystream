import fs from 'node:fs'
import { ethers } from 'hardhat'
import { assertReviewedBuild, assertReviewedArtifact } from './assert-reviewed-build'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

function tokenList() {
  let parsed: unknown
  const file = String(process.env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_FILE ?? '').trim()
  const raw = file ? fs.readFileSync(file, 'utf8') : String(process.env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON ?? '')
  try {
    const document = JSON.parse(raw.replace(/^\uFEFF/, ''))
    parsed = Array.isArray(document) ? document : (document as { assets?: unknown })?.assets
  } catch { throw new Error(file ? `HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_FILE must contain valid JSON: ${file}` : 'HASHPAYSTREAM_XLAYER_TOKENIZED_ASSETS_JSON must be valid JSON.') }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('At least one approved X Layer token is required.')
  const result: string[] = []
  for (const item of parsed) {
    const value = item as Record<string, unknown>
    const token = String(value?.address ?? '')
    const decimals = Number(value?.decimals)
    if (!ethers.isAddress(token) || token === ethers.ZeroAddress || !Number.isInteger(decimals) || decimals < 2 || decimals > 18) throw new Error('Each token registry entry needs a valid address and decimals 2..18.')
    const normalized = ethers.getAddress(token)
    if (result.includes(normalized)) throw new Error(`Duplicate token ${normalized}.`)
    result.push(normalized)
  }
  return result
}

async function main() {
  assertReviewedBuild(); await assertReviewedArtifact('MultiAssetTradeEscrowFactory')
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected X Layer mainnet 196.`)
  if (process.env.HASHPAYSTREAM_XLAYER_MULTI_TRADE_DEPLOY_CONFIRM !== 'DEPLOY_REVIEWED_MULTI_ASSET_FACTORY_XLAYER_MAINNET') throw new Error('Explicit multi-asset factory deployment confirmation is missing.')
  const [deployer] = await ethers.getSigners(); if (!deployer) throw new Error('XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.')
  const arbiter = address('HASHPAYSTREAM_XLAYER_TRADE_ARBITER_ADDRESS')
  if (await ethers.provider.getCode(arbiter) === '0x') throw new Error('Configured arbiter Safe is not deployed on X Layer mainnet.')
  const tokens = tokenList()
  for (const token of tokens) if (await ethers.provider.getCode(token) === '0x') throw new Error(`Approved token ${token} has no X Layer bytecode.`)
  const factory = await ethers.deployContract('MultiAssetTradeEscrowFactory', [arbiter, tokens]); await factory.waitForDeployment()
  const deployed = await factory.getAddress()
  for (const token of tokens) if (!(await factory.approvedTokens(token))) throw new Error(`Factory did not approve ${token}.`)
  console.log(JSON.stringify({ deployed: true, chainId: network.chainId.toString(), contractName: 'MultiAssetTradeEscrowFactory', factory: deployed, arbiter, tokens, deployer: deployer.address, transactionHash: factory.deploymentTransaction()?.hash, fundingEnabled: false }, null, 2))
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })


