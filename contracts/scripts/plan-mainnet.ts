import { ethers } from 'hardhat'

const OFFICIAL_XLAYER_USDC = '0x74b7f16337b8972027f6196a17a631ac6de26d22'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Expected X Layer mainnet 196; received ${network.chainId}.`)
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.')
  const asset = address('XLAYER_MAINNET_USDC_ADDRESS')
  if (asset !== ethers.getAddress(OFFICIAL_XLAYER_USDC)) throw new Error('XLAYER_MAINNET_USDC_ADDRESS is not the approved native USDC contract.')
  if (await ethers.provider.getCode(asset) === '0x') throw new Error('The configured X Layer mainnet USDC contract has no bytecode.')
  const constructor = {
    asset,
    arcRepaymentRouter: address('ARC_REPAYMENT_ROUTER_ADDRESS'),
    underwritingSigner: address('UPFRONT_UNDERWRITING_SIGNER'),
    protectionSigner: address('UPFRONT_PROTECTION_SIGNER'),
    owner: address('UPFRONT_CONTRACT_OWNER'),
  }
  const factory = await ethers.getContractFactory('UpfrontAdvanceEscrow')
  const transaction = await factory.getDeployTransaction(
    constructor.asset,
    constructor.arcRepaymentRouter,
    constructor.underwritingSigner,
    constructor.protectionSigner,
    constructor.owner,
  )
  const gasEstimate = await ethers.provider.estimateGas({ from: deployer.address, data: transaction.data })
  const fee = await ethers.provider.getFeeData()
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice ?? 0n
  const predictedContract = ethers.getCreateAddress({ from: deployer.address, nonce: await ethers.provider.getTransactionCount(deployer.address) })
  const reservedAddresses = [constructor.asset, constructor.arcRepaymentRouter, constructor.underwritingSigner, constructor.protectionSigner, constructor.owner]
  const addressCollision = reservedAddresses.includes(predictedContract)
  console.log(JSON.stringify({
    dryRun: true, chainId: network.chainId.toString(), deployer: deployer.address,
    deployerNativeBalance: (await ethers.provider.getBalance(deployer.address)).toString(),
    predictedContract, addressCollision, deployable: !addressCollision,
    ownerIsDeployer: constructor.owner === deployer.address,
    constructor: { ...constructor, startsPaused: true, allowlistedFunders: [] },
    gasEstimate: gasEstimate.toString(), maximumEstimatedNativeCost: ethers.formatEther(gasEstimate * gasPrice),
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
