import { ethers } from 'hardhat'
import { assertApprovedPausedDeployment, assertReviewedStockDeliveryArtifact } from './assert-reviewed-stock-delivery'
import { verifyXLayerStockOwnerSafe } from './verify-stock-owner-safe'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}
const same = (left: string, right: string) => ethers.getAddress(left) === ethers.getAddress(right)

async function main() {
  const reviewed = await assertReviewedStockDeliveryArtifact()
  assertApprovedPausedDeployment(reviewed.plan)
  const { chainId } = await ethers.provider.getNetwork()
  if (chainId !== 196n) throw new Error(`Refusing to deploy on chain ${chainId}; expected X Layer mainnet 196.`)
  if (process.env.STOCK_DELIVERY_EXTERNAL_REVIEW_CONFIRM !== 'EXTERNAL_REVIEW_ACCEPTED_STOCK_DELIVERY_V1') throw new Error('Accepted external review confirmation is missing.')
  if (process.env.STOCK_DELIVERY_OWNER_CONTROL_CONFIRM !== 'VERIFIED_XLAYER_CONTRACT_MULTISIG') throw new Error('Verified X Layer contract multisig confirmation is missing.')
  if (process.env.STOCK_DELIVERY_MAINNET_DEPLOY_CONFIRM !== 'DEPLOY_REVIEWED_STOCK_DELIVERY_V1_PAUSED_XLAYER_MAINNET') throw new Error('Explicit paused stock delivery deployment confirmation is missing.')

  const [deployer] = await ethers.getSigners()
  if (!deployer) throw new Error('XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY is unavailable.')
  const arcRepaymentRouter = address('HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS')
  const underwritingSigner = address('HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER')
  const riskSigner = address('HASHPAYSTREAM_STOCK_RISK_SIGNER')
  const protectionSigner = address('HASHPAYSTREAM_STOCK_PROTECTION_SIGNER')
  const owner = address('HASHPAYSTREAM_STOCK_OWNER_MULTISIG')
  const roles = [underwritingSigner, riskSigner, protectionSigner, owner]
  if (new Set(roles.map(value => value.toLowerCase())).size !== roles.length || roles.some(value => same(value, deployer.address)) || roles.some(value => same(value, arcRepaymentRouter))) throw new Error('Stock delivery roles, owner, deployer and Arc router must be separate.')
  const verifiedOwnerSafe = await verifyXLayerStockOwnerSafe(ethers.provider, owner)
  if (verifiedOwnerSafe.owners.some(safeOwner => [arcRepaymentRouter, ...roles, deployer.address].some(value => same(safeOwner, value)))) {
    throw new Error('Safe owners must be separate from protocol roles, the Arc router and deployer.')
  }

  const existing = String(process.env.HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS ?? '').trim()
  if (existing) {
    if (!ethers.isAddress(existing)) throw new Error('HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS is invalid.')
    if (await ethers.provider.getCode(existing) !== '0x') throw new Error('A stock delivery contract is already configured; this v1 deployer never replaces it.')
  }
  const predictedContract = ethers.getCreateAddress({ from: deployer.address, nonce: await ethers.provider.getTransactionCount(deployer.address) })
  if ([arcRepaymentRouter, ...roles].some(value => same(value, predictedContract))) throw new Error('Predicted contract address collides with a configured protocol role.')

  const delivery = await ethers.deployContract('AgreementBackedStockDelivery', [arcRepaymentRouter, underwritingSigner, riskSigner, protectionSigner, owner])
  await delivery.waitForDeployment()
  const contract = await delivery.getAddress()
  if (!(await delivery.paused()) || !same(await delivery.owner(), owner) || !same(await delivery.arcRepaymentRouter(), arcRepaymentRouter)
    || !same(await delivery.underwritingSigner(), underwritingSigner) || !same(await delivery.riskSigner(), riskSigner) || !same(await delivery.protectionSigner(), protectionSigner)) {
    throw new Error('New stock delivery contract does not match the reviewed paused configuration.')
  }
  console.log(JSON.stringify({
    contractName: 'AgreementBackedStockDelivery', deliveryVersion: '1', chainId: '196', contract,
    arcRepaymentRouter, underwritingSigner, riskSigner, protectionSigner, owner, paused: true,
    allowedAssets: [], allowedFunders: [], financialProductionReady: false,
    deployer: deployer.address, predictedContract, transactionHash: delivery.deploymentTransaction()?.hash,
    ownerSafePolicy: 'CANONICAL_SAFE_1_5_0_2_OF_3_NO_MODULES_NO_GUARDS',
    ownerSafeOwners: [...verifiedOwnerSafe.owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
  }, null, 2))
}

main().catch(reason => { console.error(reason instanceof Error ? reason.message : reason); process.exitCode = 1 })