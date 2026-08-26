import { ethers } from 'hardhat'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 1952n) throw new Error(`Refusing to deploy on chain ${network.chainId}; expected X Layer testnet 1952.`)
  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_DEPLOYER_PRIVATE_KEY is unavailable.')
  const existing = String(process.env.POLYDESK_UPFRONT_ESCROW_CONTRACT_ADDRESS ?? '').trim()
  let replacedEscrow: string | undefined
  if (existing) {
    const deployedAddress = address('POLYDESK_UPFRONT_ESCROW_CONTRACT_ADDRESS')
    if (await ethers.provider.getCode(deployedAddress) !== '0x') {
      if (process.env.UPFRONT_REPLACEMENT_CONFIRM !== 'REPLACE_EMPTY_PAUSED_STACK') {
        throw new Error('Upfront escrow is already deployed at ' + deployedAddress + '. Explicit coordinated replacement confirmation is missing.')
      }
      const existingEscrow = new ethers.Contract(deployedAddress, [
        'function asset() view returns (address)',
        'function paused() view returns (bool)',
      ], ethers.provider)
      const existingAsset = await existingEscrow.asset()
      const token = new ethers.Contract(existingAsset, ['function balanceOf(address) view returns (uint256)'], ethers.provider)
      const [paused, balance] = await Promise.all([
        existingEscrow.paused().catch(() => undefined),
        token.balanceOf(deployedAddress),
      ])
      if (balance !== 0n || paused === false) throw new Error('Refusing to replace an active or funded Upfront escrow.')
      if (paused === undefined && process.env.UPFRONT_LEGACY_TESTNET_REPLACEMENT_CONFIRM !== 'REPLACE_EMPTY_LEGACY_TESTNET') {
        throw new Error('Legacy testnet escrow has no pause getter. Explicit empty-legacy-testnet replacement confirmation is missing.')
      }
      replacedEscrow = deployedAddress
    }
  }
  const asset = address('XLAYER_TEST_USDC_ADDRESS')
  const arcRepaymentRouter = address('ARC_REPAYMENT_ROUTER_ADDRESS')
  const underwritingSigner = address('UPFRONT_UNDERWRITING_SIGNER')
  const protectionSigner = address('UPFRONT_PROTECTION_SIGNER')
  const owner = address('UPFRONT_XLAYER_CONTRACT_OWNER')
  const escrow = await ethers.deployContract('UpfrontAdvanceEscrow', [asset, arcRepaymentRouter, underwritingSigner, protectionSigner, owner])
  await escrow.waitForDeployment()
  console.log(JSON.stringify({
    chainId: network.chainId.toString(), contract: await escrow.getAddress(), asset,
    arcRepaymentRouter, underwritingSigner, protectionSigner, owner, paused: true, deployer: deployer.address,
    replacedEscrow,
    transactionHash: escrow.deploymentTransaction()?.hash,
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
