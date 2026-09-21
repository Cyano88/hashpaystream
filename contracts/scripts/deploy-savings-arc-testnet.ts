import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ethers } from 'hardhat'
import { assertPersonalSavingsArcTestnetBuild } from './assert-personal-savings-build'

const ARC_TEST_USDC = '0x3600000000000000000000000000000000000000'

async function main() {
  await assertPersonalSavingsArcTestnetBuild()
  const review = JSON.parse(readFileSync(resolve(__dirname, '../audits/personal-savings-arc-testnet-v1-manifest.json'), 'utf8'))
  if (review.deployment?.enabled) throw new Error('Arc Testnet savings vault is already recorded; refusing a duplicate deployment.')
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 5_042_002n) throw new Error('Refusing to deploy on chain ' + network.chainId + '; expected Arc Testnet 5042002.')
  if (process.env.SAVINGS_ARC_TESTNET_DEPLOY_CONFIRM !== 'DEPLOY_REVIEWED_ARC_TEST_SAVINGS_V1') {
    throw new Error('Explicit Arc Testnet savings deployment confirmation is missing.')
  }
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('ARC_DEPLOYER_PRIVATE_KEY is unavailable.')
  const asset = ethers.getAddress(ARC_TEST_USDC)
  if (await ethers.provider.getCode(asset) === '0x') throw new Error('Arc Testnet USDC has no bytecode.')
  const predictedContract = ethers.getCreateAddress({ from: deployer.address, nonce: await ethers.provider.getTransactionCount(deployer.address) })
  if (predictedContract === asset) throw new Error('Predicted vault address collides with Arc Testnet USDC.')

  const vault = await ethers.deployContract('PersonalSavingsVault', [asset])
  await vault.waitForDeployment()
  const contract = await vault.getAddress()
  if (await vault.asset() !== asset || await vault.WEEKLY() !== 604800n || await vault.MONTHLY() !== 2592000n || await vault.EMERGENCY_EXIT_DELAY() !== 172800n || await vault.MAX_PAGE_SIZE() !== 100n) {
    throw new Error('Deployed savings constants do not match the reviewed policy.')
  }
  console.log(JSON.stringify({
    network: 'Arc Testnet', chainId: Number(network.chainId), contract, asset, predictedContract,
    deployer: deployer.address, transactionHash: vault.deploymentTransaction()?.hash,
    depositsEnabled: false, financialProductionReady: false,
  }, null, 2))
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
