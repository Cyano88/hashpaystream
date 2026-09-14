import { ethers } from 'hardhat'
import { assertApprovedPausedDeployment, assertReviewedStockDeliveryArtifact, assertRuntimeMatchesReviewedArtifact } from './assert-reviewed-stock-delivery'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}
function equal(label: string, actual: string, expected: string) {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) throw new Error(`${label} does not match the reviewed deployment configuration.`)
}

async function main() {
  const reviewed = await assertReviewedStockDeliveryArtifact()
  assertApprovedPausedDeployment(reviewed.plan)
  const { chainId } = await ethers.provider.getNetwork()
  if (chainId !== 196n) throw new Error(`Refusing to verify chain ${chainId}; expected X Layer mainnet 196.`)
  const contract = address('HASHPAYSTREAM_STOCK_DELIVERY_CONTRACT_ADDRESS')
  const arcRepaymentRouter = address('HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS')
  const underwritingSigner = address('HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER')
  const riskSigner = address('HASHPAYSTREAM_STOCK_RISK_SIGNER')
  const protectionSigner = address('HASHPAYSTREAM_STOCK_PROTECTION_SIGNER')
  const owner = address('HASHPAYSTREAM_STOCK_OWNER_MULTISIG')
  const asset = address('HASHPAYSTREAM_STOCK_ASSET_ADDRESS')
  const hash = String(process.env.STOCK_DELIVERY_VERIFY_DEPLOY_TX_HASH ?? '').trim()
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error('STOCK_DELIVERY_VERIFY_DEPLOY_TX_HASH is required.')

  const receipt = await ethers.provider.getTransactionReceipt(hash)
  if (!receipt || receipt.status !== 1 || !receipt.contractAddress) throw new Error('A successful stock delivery creation receipt is required.')
  equal('deployment receipt contract', receipt.contractAddress, contract)
  const transaction = await ethers.provider.getTransaction(hash)
  if (!transaction || transaction.to !== null || transaction.chainId !== chainId) throw new Error('Deployment transaction is not direct contract creation on X Layer mainnet.')
  const factory = await ethers.getContractFactory('AgreementBackedStockDelivery')
  const expected = await factory.getDeployTransaction(arcRepaymentRouter, underwritingSigner, riskSigner, protectionSigner, owner)
  if (String(transaction.data).toLowerCase() !== String(expected.data).toLowerCase()) throw new Error('Creation bytecode or constructor arguments differ from the reviewed deployment.')

  const code = await ethers.provider.getCode(contract)
  if (code === '0x') throw new Error('Stock delivery deployment has no current runtime code.')
  assertRuntimeMatchesReviewedArtifact(code, reviewed.artifact.deployedBytecode, reviewed.immutableReferences)
  const deployed = await ethers.getContractAt('AgreementBackedStockDelivery', contract)
  equal('Arc repayment router', await deployed.arcRepaymentRouter(), arcRepaymentRouter)
  equal('underwriting signer', await deployed.underwritingSigner(), underwritingSigner)
  equal('risk signer', await deployed.riskSigner(), riskSigner)
  equal('protection signer', await deployed.protectionSigner(), protectionSigner)
  equal('owner', await deployed.owner(), owner)
  equal('pending owner', await deployed.pendingOwner(), ethers.ZeroAddress)
  if (!(await deployed.paused())) throw new Error('Reviewed stock delivery deployment must remain paused.')
  if (await deployed.allowedStockAssets(asset)) throw new Error('Pilot stock asset must remain disallowed during deployment verification.')
  const token = new ethers.Contract(asset, ['function balanceOf(address) view returns (uint256)'], ethers.provider)
  if (await token.balanceOf(contract) !== 0n) throw new Error('Stock delivery contract unexpectedly holds stock inventory.')
  const domain = await deployed.eip712Domain()
  if (domain.name !== 'HashPayStream Stock Delivery' || domain.version !== '1' || domain.chainId !== 196n) throw new Error('Stock delivery EIP-712 domain does not match.')
  equal('domain contract', domain.verifyingContract, contract)
  console.log(JSON.stringify({
    verified: true, readOnly: true, contractName: 'AgreementBackedStockDelivery', deliveryVersion: '1',
    chainId: '196', contract, deploymentBlock: receipt.blockNumber, creationBytecodeAndArgumentsMatch: true,
    runtimeHash: ethers.keccak256(code), paused: true, assetAllowed: false, contractStockBalance: '0',
    financialProductionReady: false,
  }, null, 2))
}

main().catch(reason => { console.error(reason instanceof Error ? reason.message : reason); process.exitCode = 1 })