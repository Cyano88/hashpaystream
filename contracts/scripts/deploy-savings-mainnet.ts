import { ethers } from 'hardhat'

const NATIVE_XLAYER_USDC = '0xB6CEceAB302E2E4948951eE7843FC24E92933061'

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected X Layer mainnet 196.`)
  if (process.env.SAVINGS_MAINNET_DEPLOY_CONFIRM !== 'DEPLOY_NONCUSTODIAL_USDC_SAVINGS_V3') {
    throw new Error('Explicit savings mainnet deployment confirmation is missing.')
  }
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.')
  const asset = ethers.getAddress(NATIVE_XLAYER_USDC)
  if (await ethers.provider.getCode(asset) === '0x') throw new Error('Native X Layer USDC has no bytecode.')
  const predictedContract = ethers.getCreateAddress({ from: deployer.address, nonce: await ethers.provider.getTransactionCount(deployer.address) })
  if (predictedContract === asset) throw new Error('Predicted vault address collides with native USDC.')

  const vault = await ethers.deployContract('PersonalSavingsVault', [asset])
  await vault.waitForDeployment()
  const contract = await vault.getAddress()
  if (await vault.asset() !== asset || await vault.WEEKLY() !== 604800n || await vault.MONTHLY() !== 2592000n || await vault.EMERGENCY_EXIT_DELAY() !== 172800n || await vault.MAX_PAGE_SIZE() !== 100n) {
    throw new Error('Deployed savings constants do not match the reviewed policy.')
  }
  console.log(JSON.stringify({
    chainId: network.chainId.toString(), contract, asset, deployer: deployer.address,
    predictedContract, weeklySeconds: '604800', monthlySeconds: '2592000', emergencyExitDelaySeconds: '172800', maxPageSize: '100',
    yieldEnabled: false, administrator: null, transactionHash: vault.deploymentTransaction()?.hash,
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
