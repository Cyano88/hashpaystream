import { ethers } from 'hardhat'

const NATIVE_XLAYER_USDC = '0xB6CEceAB302E2E4948951eE7843FC24E92933061'

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected X Layer mainnet 196.`)
  if (process.env.LOCKED_SAVINGS_MAINNET_DEPLOY_CONFIRM !== 'DEPLOY_REVIEWED_LOCKED_USDC_SAVINGS_V1') {
    throw new Error('Explicit locked-savings mainnet deployment confirmation is missing.')
  }
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.')
  const asset = ethers.getAddress(NATIVE_XLAYER_USDC)
  if (await ethers.provider.getCode(asset) === '0x') throw new Error('Native X Layer USDC has no bytecode.')

  const vault = await ethers.deployContract('LockedSavingsCohortVault', [asset])
  await vault.waitForDeployment()
  const contract = await vault.getAddress()
  if (
    await vault.asset() !== asset ||
    await vault.EARLY_EXIT_PENALTY_BPS() !== 500n ||
    await vault.MINIMUM_DEPOSIT() !== 1_000_000n ||
    await vault.COHORT_INTERVAL() !== 604800n ||
    await vault.THIRTY_DAYS() !== 2592000n ||
    await vault.NINETY_DAYS() !== 7776000n ||
    await vault.ONE_EIGHTY_DAYS() !== 15552000n ||
    await vault.THREE_SIXTY_FIVE_DAYS() !== 31536000n
  ) throw new Error('Deployed locked-savings constants do not match the reviewed policy.')

  console.log(JSON.stringify({
    chainId: network.chainId.toString(), contract, asset, deployer: deployer.address,
    earlyExitPenaltyBps: '500', minimumDeposit: '1000000', cohortIntervalSeconds: '604800',
    termsSeconds: ['2592000', '7776000', '15552000', '31536000'],
    administrator: null, upgradeable: false, transactionHash: vault.deploymentTransaction()?.hash,
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })