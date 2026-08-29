import { ethers } from 'hardhat'

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

function assertEqual(label: string, actual: string, expected: string) {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) throw new Error(`${label} mismatch: expected ${expected}; received ${actual}.`)
}

async function verifiedReceipt() {
  const hash = String(process.env.UPFRONT_VERIFY_DEPLOY_TX_HASH ?? '').trim()
  if (!hash) return undefined
  const receipt = await ethers.provider.getTransactionReceipt(hash)
  if (!receipt || receipt.status !== 1) throw new Error('The configured deployment transaction is not confirmed successfully.')
  return { transactionHash: hash, blockNumber: receipt.blockNumber, status: receipt.status }
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId === 5_042_002n) {
    const contract = address('ARC_REPAYMENT_ROUTER_ADDRESS')
    if (await ethers.provider.getCode(contract) === '0x') throw new Error('Arc repayment router has no bytecode.')
    const router = await ethers.getContractAt('ArcRepaymentRouter', contract)
    const [asset, creditSigner, owner, pendingOwner, zeroHashSettled] = await Promise.all([
      router.asset(), router.creditSigner(), router.owner(), router.pendingOwner(), router.settledAgreements(ethers.ZeroHash),
    ])
    assertEqual('asset', asset, address('ARC_TEST_USDC_ADDRESS'))
    assertEqual('credit signer', creditSigner, address('UPFRONT_REPAYMENT_CREDIT_SIGNER'))
    assertEqual('owner', owner, address('UPFRONT_ARC_CONTRACT_OWNER'))
    assertEqual('pending owner', pendingOwner, ethers.ZeroAddress)
    const token = await ethers.getContractAt('IERC20', asset)
    const balance = await token.balanceOf(contract)
    console.log(JSON.stringify({
      verified: true, chainId: network.chainId.toString(), contract, asset, creditSigner, owner,
      pendingOwner, settlementVersion: 2, zeroHashSettled, tokenBalance: balance.toString(),
      receipt: await verifiedReceipt(),
    }, null, 2))
    return
  }

  if (network.chainId !== 196n && network.chainId !== 1952n) throw new Error('Expected Arc testnet or X Layer.')
  const contract = address(network.chainId === 196n
    ? 'POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS'
    : 'POLYDESK_UPFRONT_ESCROW_CONTRACT_ADDRESS')
  if (await ethers.provider.getCode(contract) === '0x') throw new Error('Upfront escrow has no bytecode.')
  const escrow = await ethers.getContractAt('UpfrontAdvanceEscrow', contract)
  const [asset, arcRepaymentRouter, underwritingSigner, protectionSigner, owner, pendingOwner, paused] = await Promise.all([
    escrow.asset(), escrow.arcRepaymentRouter(), escrow.underwritingSigner(), escrow.protectionSigner(),
    escrow.owner(), escrow.pendingOwner(), escrow.paused(),
  ])
  assertEqual('asset', asset, address(network.chainId === 196n ? 'XLAYER_MAINNET_USDC_ADDRESS' : 'XLAYER_TEST_USDC_ADDRESS'))
  assertEqual('Arc repayment router', arcRepaymentRouter, address('ARC_REPAYMENT_ROUTER_ADDRESS'))
  assertEqual('underwriting signer', underwritingSigner, address('UPFRONT_UNDERWRITING_SIGNER'))
  assertEqual('protection signer', protectionSigner, address('UPFRONT_PROTECTION_SIGNER'))
  assertEqual('owner', owner, address('UPFRONT_XLAYER_CONTRACT_OWNER'))
  assertEqual('pending owner', pendingOwner, ethers.ZeroAddress)
  if (!paused) throw new Error('New Upfront escrow must remain paused.')
  const token = await ethers.getContractAt('IERC20', asset)
  const balance = await token.balanceOf(contract)
  const verifyFunder = String(process.env.UPFRONT_VERIFY_FUNDER_ADDRESS ?? '').trim()
  const funderAllowed = verifyFunder && ethers.isAddress(verifyFunder) ? await escrow.allowedFunders(verifyFunder) : undefined
  if (funderAllowed) throw new Error('The verification funder is unexpectedly allowlisted.')
  console.log(JSON.stringify({
    verified: true, chainId: network.chainId.toString(), contract, asset, arcRepaymentRouter,
    underwritingSigner, protectionSigner, owner, pendingOwner, paused, tokenBalance: balance.toString(),
    checkedFunder: verifyFunder || undefined, checkedFunderAllowed: funderAllowed,
    receipt: await verifiedReceipt(),
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
