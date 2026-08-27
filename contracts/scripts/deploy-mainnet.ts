import { ethers } from 'hardhat'

const OFFICIAL_XLAYER_USDC = '0xB6CEceAB302E2E4948951eE7843FC24E92933061'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected X Layer mainnet 196.`)
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.')
  if (process.env.UPFRONT_OWNER_CONTROL_CONFIRM !== 'CONTROLLED_MAINNET_OWNER') throw new Error('Explicit confirmation that UPFRONT_XLAYER_CONTRACT_OWNER is controlled is missing.')
  if (process.env.UPFRONT_MAINNET_DEPLOY_CONFIRM !== 'DEPLOY_PAUSED_XLAYER_MAINNET') throw new Error('Explicit paused X Layer mainnet deployment confirmation is missing.')

  const configuredAsset = address('XLAYER_MAINNET_USDC_ADDRESS')
  if (configuredAsset !== ethers.getAddress(OFFICIAL_XLAYER_USDC)) throw new Error('XLAYER_MAINNET_USDC_ADDRESS is not the approved native USDC contract.')
  if (await ethers.provider.getCode(configuredAsset) === '0x') throw new Error('The configured X Layer mainnet USDC contract has no bytecode.')

  const existing = String(process.env.POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS ?? '').trim()
  let replacedEscrow: string | undefined
  if (existing) {
    const deployedAddress = address('POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS')
    if (await ethers.provider.getCode(deployedAddress) !== '0x') {
      if (process.env.UPFRONT_REPLACEMENT_CONFIRM !== 'REPLACE_EMPTY_PAUSED_STACK') {
        throw new Error('A production Upfront escrow is already recorded. Explicit coordinated replacement confirmation is missing.')
      }
      const existingEscrow = new ethers.Contract(deployedAddress, [
        'function asset() view returns (address)',
        'function paused() view returns (bool)',
      ], ethers.provider)
      const existingAsset = await existingEscrow.asset()
      const token = new ethers.Contract(existingAsset, ['function balanceOf(address) view returns (uint256)'], ethers.provider)
      const [paused, balance] = await Promise.all([
        existingEscrow.paused(),
        token.balanceOf(deployedAddress),
      ])
      if (!paused || balance !== 0n) throw new Error('Refusing to replace an active or funded production Upfront escrow.')
      replacedEscrow = deployedAddress
    }
  }

  const arcRepaymentRouter = address('ARC_REPAYMENT_ROUTER_ADDRESS')
  const underwritingSigner = address('UPFRONT_UNDERWRITING_SIGNER')
  const protectionSigner = address('UPFRONT_PROTECTION_SIGNER')
  const owner = address('UPFRONT_XLAYER_CONTRACT_OWNER')
  const predictedContract = ethers.getCreateAddress({ from: deployer.address, nonce: await ethers.provider.getTransactionCount(deployer.address) })
  const reservedAddresses = [configuredAsset, arcRepaymentRouter, underwritingSigner, protectionSigner, owner]
  if (reservedAddresses.includes(predictedContract)) throw new Error(`Predicted escrow address ${predictedContract} collides with a configured protocol address.`)
  const escrow = await ethers.deployContract('UpfrontAdvanceEscrow', [
    configuredAsset, arcRepaymentRouter, underwritingSigner, protectionSigner, owner,
  ])
  await escrow.waitForDeployment()
  console.log(JSON.stringify({
    chainId: network.chainId.toString(), contract: await escrow.getAddress(), asset: configuredAsset,
    arcRepaymentRouter, underwritingSigner, protectionSigner, owner, paused: true,
    allowlistedFunders: [], deployer: deployer.address, predictedContract, replacedEscrow,
    transactionHash: escrow.deploymentTransaction()?.hash,
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
