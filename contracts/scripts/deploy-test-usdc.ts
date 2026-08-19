import { ethers } from 'hardhat'

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 1952n) {
    throw new Error('Refusing to deploy on chain ' + network.chainId + '; expected X Layer testnet 1952.')
  }
  if (String(process.env.ALLOW_TEST_TOKEN_DEPLOYMENT ?? '').trim() !== 'true') {
    throw new Error('Set ALLOW_TEST_TOKEN_DEPLOYMENT=true to acknowledge this is non-production test USDC.')
  }
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_DEPLOYER_PRIVATE_KEY is unavailable.')
  const existing = String(process.env.XLAYER_TEST_USDC_ADDRESS ?? '').trim()
  if (existing) {
    if (!ethers.isAddress(existing) || existing === ethers.ZeroAddress) throw new Error('XLAYER_TEST_USDC_ADDRESS is invalid.')
    const deployedAddress = ethers.getAddress(existing)
    if (await ethers.provider.getCode(deployedAddress) !== '0x') {
      throw new Error('Test USDC is already deployed at ' + deployedAddress + '. Refusing duplicate deployment.')
    }
  }
  const token = await ethers.deployContract('MockUSDC')
  await token.waitForDeployment()
  console.log(JSON.stringify({
    chainId: network.chainId.toString(),
    contract: await token.getAddress(),
    symbol: 'tUSDC',
    productionAsset: false,
    deployer: deployer.address,
    transactionHash: token.deploymentTransaction()?.hash,
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
