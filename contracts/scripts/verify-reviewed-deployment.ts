import { ethers } from 'hardhat'
import { assertReviewedBuild, assertReviewedArtifact } from './assert-reviewed-build'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(name + ' must be a non-zero EVM address.')
  return ethers.getAddress(value)
}
function equal(label: string, actual: string, expected: string) {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) throw new Error(label + ' does not match the reviewed deployment configuration.')
}

async function main() {
  assertReviewedBuild()
  const { chainId } = await ethers.provider.getNetwork()
  const arc = chainId === 5042002n
  if (!arc && chainId !== 196n) throw new Error('Only the configured X Layer mainnet and Arc testnet verification targets are supported.')
  const name = arc ? 'ArcRepaymentRouterV4' : 'UpfrontAdvanceEscrowV2'
  await assertReviewedArtifact(name)
  const contract = address(arc ? 'ARC_REPAYMENT_ROUTER_ADDRESS' : 'POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS')
  const hash = String(process.env.UPFRONT_VERIFY_DEPLOY_TX_HASH ?? '').trim()
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error('A deployment transaction hash is required.')
  const asset = address(arc ? 'ARC_TEST_USDC_ADDRESS' : 'XLAYER_MAINNET_USDC_ADDRESS')
  equal('asset', asset, arc ? '0x3600000000000000000000000000000000000000' : '0xB6CEceAB302E2E4948951eE7843FC24E92933061')
  const owner = address(arc ? 'UPFRONT_ARC_CONTRACT_OWNER' : 'UPFRONT_XLAYER_CONTRACT_OWNER')
  const args = arc
    ? [asset, address('UPFRONT_REPAYMENT_CREDIT_SIGNER'), address('HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS'), owner]
    : [asset, address('ARC_REPAYMENT_ROUTER_ADDRESS'), address('UPFRONT_UNDERWRITING_SIGNER'), address('UPFRONT_PROTECTION_SIGNER'), owner]
  const receipt = await ethers.provider.getTransactionReceipt(hash)
  if (!receipt || receipt.status !== 1 || !receipt.contractAddress) throw new Error('Successful contract creation receipt is required.')
  equal('deployment receipt contract', receipt.contractAddress, contract)
  const transaction = await ethers.provider.getTransaction(hash)
  if (!transaction || transaction.to !== null || transaction.chainId !== chainId) throw new Error('Deployment transaction is not a direct creation on the expected chain.')
  const factory = await ethers.getContractFactory(name)
  const expected = await factory.getDeployTransaction(...args)
  if (String(transaction.data).toLowerCase() !== String(expected.data).toLowerCase()) throw new Error('Deployment creation bytecode or constructor arguments do not match the reviewed artifact.')
  if (await ethers.provider.getCode(contract) === '0x') throw new Error('Deployment has no current runtime code.')
  const deployed = await ethers.getContractAt(name, contract)
  equal('asset', await deployed.asset(), asset)
  equal('owner', await deployed.owner(), owner)
  equal('pending owner', await deployed.pendingOwner(), ethers.ZeroAddress)
  if (!(await deployed.paused())) throw new Error('Reviewed deployment must remain paused before activation.')
  const domain = await deployed.eip712Domain()
  if (domain.name !== (arc ? 'HashPayStream Upfront Repayment' : 'HashPayStream Upfront')
    || domain.version !== (arc ? '4' : '2') || domain.chainId !== chainId) throw new Error('Reviewed EIP-712 domain does not match.')
  equal('domain contract', domain.verifyingContract, contract)
  if (arc) {
    equal('credit signer', await deployed.creditSigner(), args[1])
    equal('immutable treasury', await deployed.platformTreasury(), args[2])
  } else {
    equal('Arc router', await deployed.arcRepaymentRouter(), args[1])
    equal('underwriting signer', await deployed.underwritingSigner(), args[2])
    equal('protection signer', await deployed.protectionSigner(), args[3])
  }
  console.log(JSON.stringify({
    verified: true, readOnly: true, contractName: name, chainId: chainId.toString(), contract,
    creationBytecodeAndArgumentsMatch: true, paused: true, signatureVersion: arc ? '4' : '2',
    financialProductionReady: false, deploymentBlock: receipt.blockNumber,
  }, null, 2))
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
