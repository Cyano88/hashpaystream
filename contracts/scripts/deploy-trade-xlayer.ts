import { ethers } from 'hardhat'
import { assertReviewedBuild, assertReviewedArtifact } from './assert-reviewed-build'
function address(name: string) { const value = String(process.env[name] ?? '').trim(); if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`); return ethers.getAddress(value) }
async function main() {
  assertReviewedBuild(); await assertReviewedArtifact('TradeEscrowFactory')
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected X Layer mainnet 196.`)
  if (process.env.HASHPAYSTREAM_XLAYER_TRADE_DEPLOY_CONFIRM !== 'DEPLOY_REVIEWED_TRADE_FACTORY_XLAYER_MAINNET') throw new Error('Explicit trade factory deployment confirmation is missing.')
  const [deployer] = await ethers.getSigners(); if (!deployer) throw new Error('XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.')
  const token = address('HASHPAYSTREAM_XLAYER_TOKENIZED_ASSET_ADDRESS'); const arbiter = address('HASHPAYSTREAM_XLAYER_TRADE_ARBITER_ADDRESS')
    if (await ethers.provider.getCode(arbiter) === '0x') throw new Error('Configured arbiter Safe is not deployed on X Layer mainnet.')
  if (token === arbiter) throw new Error('Token and arbiter must be different addresses.')
  const factory = await ethers.deployContract('TradeEscrowFactory', [token, arbiter]); await factory.waitForDeployment()
  const deployed = await factory.getAddress(); if ((await factory.token()) !== token || (await factory.arbiter()) !== arbiter) throw new Error('Factory immutable configuration verification failed.')
  console.log(JSON.stringify({ deployed: true, chainId: network.chainId.toString(), contractName: 'TradeEscrowFactory', factory: deployed, token, arbiter, deployer: deployer.address, transactionHash: factory.deploymentTransaction()?.hash, fundingEnabled: false }, null, 2))
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })