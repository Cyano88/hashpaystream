import { ethers } from 'hardhat'
import { assertReviewedBuild, assertReviewedArtifact } from './assert-reviewed-build'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(name + ' must be a non-zero EVM address.')
  return ethers.getAddress(value)
}

async function main() {
  assertReviewedBuild()
  await assertReviewedArtifact('ArcRepaymentRouterV4')
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 5_042_002n) throw new Error('Expected Arc testnet 5042002.')
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('ARC_DEPLOYER_PRIVATE_KEY is unavailable.')
  const nonce = await ethers.provider.getTransactionCount(deployer.address)
  const predictedContract = ethers.getCreateAddress({ from: deployer.address, nonce })
  const asset = address('ARC_TEST_USDC_ADDRESS')
  const creditSigner = address('UPFRONT_REPAYMENT_CREDIT_SIGNER')
  const owner = address('UPFRONT_ARC_CONTRACT_OWNER')
  const treasury = address('HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS')
  const factory = await ethers.getContractFactory('ArcRepaymentRouterV4')
  const transaction = await factory.getDeployTransaction(asset, creditSigner, treasury, owner)
  const gasEstimate = await ethers.provider.estimateGas({ from: deployer.address, data: transaction.data })
  const fee = await ethers.provider.getFeeData()
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice ?? 0n
  const deployerNativeBalance = await ethers.provider.getBalance(deployer.address)
  const maximumEstimatedNativeCost = gasEstimate * gasPrice
  const reservedAddresses = [asset, creditSigner, treasury, owner]
  const addressCollision = reservedAddresses.includes(predictedContract)
  console.log(JSON.stringify({
    action: 'DEPLOY_REVIEWED_ARC_REPAYMENT_ROUTER',
    contractName: 'ArcRepaymentRouterV4', signatureVersion: '4', financialProductionReady: false,
    dryRun: true,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    deployerNativeBalance: deployerNativeBalance.toString(),
    nonce,
    predictedContract,
    addressCollision,
    deployable: !addressCollision && deployerNativeBalance >= maximumEstimatedNativeCost,
    constructor: { asset, creditSigner, treasury, owner, startsPaused: true },
    gasEstimate: gasEstimate.toString(),
    maximumEstimatedNativeCost: ethers.formatEther(maximumEstimatedNativeCost),
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
