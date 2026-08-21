import { ethers } from 'hardhat'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 196n) throw new Error(`Expected X Layer mainnet 196; received ${network.chainId}.`)
  const contractAddress = address('POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS')
  const transactionHash = String(process.env.UPFRONT_MAINNET_DEPLOY_TX_HASH ?? '').trim()
  if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) throw new Error('UPFRONT_MAINNET_DEPLOY_TX_HASH is invalid.')
  const code = await ethers.provider.getCode(contractAddress)
  if (code === '0x') throw new Error('The recorded mainnet escrow has no bytecode.')
  const receipt = await ethers.provider.getTransactionReceipt(transactionHash)
  if (!receipt || receipt.status !== 1 || receipt.contractAddress !== contractAddress) throw new Error('The deployment receipt does not match the recorded escrow.')
  const escrow = await ethers.getContractAt('UpfrontAdvanceEscrow', contractAddress)
  const [asset, arcRepaymentRouter, underwritingSigner, protectionSigner, owner, pendingOwner, maxAdvanceAmount, maxTotalFunded, totalFunded, paused] = await Promise.all([
    escrow.asset(), escrow.arcRepaymentRouter(), escrow.underwritingSigner(), escrow.protectionSigner(), escrow.owner(), escrow.pendingOwner(),
    escrow.maxAdvanceAmount(), escrow.maxTotalFunded(), escrow.totalFunded(), escrow.paused(),
  ])
  console.log(JSON.stringify({
    verified: true, chainId: network.chainId.toString(), contract: contractAddress, transactionHash,
    blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), bytecodeBytes: (code.length - 2) / 2,
    asset, arcRepaymentRouter, underwritingSigner, protectionSigner, owner, pendingOwner,
    maxAdvanceAmount: maxAdvanceAmount.toString(), maxTotalFunded: maxTotalFunded.toString(), totalFunded: totalFunded.toString(), paused,
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
