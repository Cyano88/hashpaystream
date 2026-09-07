import { ethers } from 'hardhat'
import { assertReviewedBuild, assertReviewedArtifact } from './assert-reviewed-build'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

async function main() {
  assertReviewedBuild()
  await assertReviewedArtifact('ArcRepaymentRouterV4')
  if (process.env.UPFRONT_ARC_DEPLOY_CONFIRM !== 'DEPLOY_REVIEWED_V4_PAUSED_ARC_TESTNET') throw new Error('Explicit reviewed paused Arc testnet deployment confirmation is missing.')
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 5_042_002n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected Arc testnet 5042002.`)
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('ARC_DEPLOYER_PRIVATE_KEY is unavailable.')
  const existing = String(process.env.ARC_REPAYMENT_ROUTER_ADDRESS ?? '').trim()
  let priorRouter: string | undefined
  if (existing) {
    const deployedAddress = address('ARC_REPAYMENT_ROUTER_ADDRESS')
    if (await ethers.provider.getCode(deployedAddress) !== '0x') {
      if (process.env.UPFRONT_REPLACEMENT_CONFIRM !== 'REPLACE_EMPTY_PAUSED_STACK') {
        throw new Error('Arc repayment router is already deployed at ' + deployedAddress + '. Explicit coordinated replacement confirmation is missing.')
      }
      const existingRouter = new ethers.Contract(deployedAddress, ['function asset() view returns (address)'], ethers.provider)
      const existingAsset = await existingRouter.asset()
      const token = new ethers.Contract(existingAsset, ['function balanceOf(address) view returns (uint256)'], ethers.provider)
      const balance = await token.balanceOf(deployedAddress)
      if (balance !== 0n) throw new Error('Refusing to replace a repayment router that holds repayment funds.')
      priorRouter = deployedAddress
    }
  }
  const asset = address('ARC_TEST_USDC_ADDRESS')
  if (asset !== ethers.getAddress('0x3600000000000000000000000000000000000000')) throw new Error('ARC_TEST_USDC_ADDRESS is not the official Arc Testnet USDC contract.')
  const creditSigner = address('UPFRONT_REPAYMENT_CREDIT_SIGNER')
  const owner = address('UPFRONT_ARC_CONTRACT_OWNER')
  const treasury = address('HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS')
  const router = await ethers.deployContract('ArcRepaymentRouterV4', [asset, creditSigner, treasury, owner])
  await router.waitForDeployment()
  if (!(await router.paused())) throw new Error('Reviewed router did not start paused.')
  if (ethers.getAddress(await router.platformTreasury()) !== treasury) throw new Error('Reviewed router treasury does not match.')
  console.log(JSON.stringify({
    contractName: 'ArcRepaymentRouterV4', signatureVersion: '4', financialProductionReady: false, paused: true,
    chainId: network.chainId.toString(), contract: await router.getAddress(), asset,
    creditSigner, treasury, owner, deployer: deployer.address, priorRouter, legacyRetirementVerified: false,
    transactionHash: router.deploymentTransaction()?.hash,
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
