import { ethers } from 'hardhat'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(name + ' must be a non-zero EVM address.')
  return ethers.getAddress(value)
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 1952n) throw new Error('Expected X Layer testnet 1952.')
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_DEPLOYER_PRIVATE_KEY is unavailable.')

  const xNonce = await ethers.provider.getTransactionCount(deployer.address)
  const predictedArcRouter = address('ARC_REPAYMENT_ROUTER_ADDRESS')
  const testUsdc = address('XLAYER_TEST_USDC_ADDRESS')
  if (await ethers.provider.getCode(testUsdc) === '0x') throw new Error('The configured X Layer test USDC contract has no bytecode.')
  const predictedEscrow = ethers.getCreateAddress({ from: deployer.address, nonce: xNonce })
  const underwritingSigner = address('UPFRONT_UNDERWRITING_SIGNER')
  const protectionSigner = address('UPFRONT_PROTECTION_SIGNER')
  const owner = address('UPFRONT_XLAYER_CONTRACT_OWNER')

  const escrowFactory = await ethers.getContractFactory('UpfrontAdvanceEscrow')
  const escrowTransaction = await escrowFactory.getDeployTransaction(
    testUsdc,
    predictedArcRouter,
    underwritingSigner,
    protectionSigner,
    owner,
  )
  const escrowGas = await ethers.provider.estimateGas({ from: deployer.address, data: escrowTransaction.data })
  const fee = await ethers.provider.getFeeData()
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice ?? 0n

  console.log(JSON.stringify({
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    transactions: [
      {
        action: 'DEPLOY_UPFRONT_ADVANCE_ESCROW',
        nonce: xNonce,
        predictedContract: predictedEscrow,
        constructor: {
          asset: testUsdc,
          arcRepaymentRouter: predictedArcRouter,
          underwritingSigner,
          protectionSigner,
          owner,
          startsPaused: true,
        },
        gasEstimate: escrowGas.toString(),
        maximumEstimatedNativeCost: ethers.formatEther(escrowGas * gasPrice),
      },
    ],
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
