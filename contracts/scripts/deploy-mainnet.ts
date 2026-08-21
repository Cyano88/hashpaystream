import { ethers } from 'hardhat'

const OFFICIAL_XLAYER_USDC = '0x74b7f16337b8972027f6196a17a631ac6de26d22'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

function units(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!/^[1-9]\d{0,30}$/.test(value)) throw new Error(`${name} must be positive integer asset units.`)
  return BigInt(value)
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected X Layer mainnet 196.`)
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_DEPLOYER_PRIVATE_KEY is unavailable.')

  const configuredAsset = address('XLAYER_MAINNET_USDC_ADDRESS')
  if (configuredAsset !== ethers.getAddress(OFFICIAL_XLAYER_USDC)) throw new Error('XLAYER_MAINNET_USDC_ADDRESS is not the approved native USDC contract.')
  if (await ethers.provider.getCode(configuredAsset) === '0x') throw new Error('The configured X Layer mainnet USDC contract has no bytecode.')

  const existing = String(process.env.POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS ?? '').trim()
  if (existing) {
    const deployedAddress = address('POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS')
    if (await ethers.provider.getCode(deployedAddress) !== '0x') throw new Error('A mainnet Upfront escrow is already recorded. Refusing duplicate deployment.')
  }

  const arcRepaymentRouter = address('ARC_REPAYMENT_ROUTER_ADDRESS')
  const underwritingSigner = address('UPFRONT_UNDERWRITING_SIGNER')
  const protectionSigner = address('UPFRONT_PROTECTION_SIGNER')
  const owner = address('UPFRONT_CONTRACT_OWNER')
  const maxAdvanceAmount = units('UPFRONT_MAX_ADVANCE_USDC_UNITS')
  const maxTotalFunded = units('UPFRONT_MAX_TOTAL_FUNDED_USDC_UNITS')
  const escrow = await ethers.deployContract('UpfrontAdvanceEscrow', [
    configuredAsset, arcRepaymentRouter, underwritingSigner, protectionSigner, owner, maxAdvanceAmount, maxTotalFunded,
  ])
  await escrow.waitForDeployment()
  console.log(JSON.stringify({
    chainId: network.chainId.toString(), contract: await escrow.getAddress(), asset: configuredAsset,
    arcRepaymentRouter, underwritingSigner, protectionSigner, owner,
    maxAdvanceAmount: maxAdvanceAmount.toString(), maxTotalFunded: maxTotalFunded.toString(), paused: true,
    allowlistedFunders: [], deployer: deployer.address, transactionHash: escrow.deploymentTransaction()?.hash,
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
