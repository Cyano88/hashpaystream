import { ethers } from 'hardhat'
import { assertPersonalSavingsArcTestnetBuild } from './assert-personal-savings-build'

const VAULT = '0x218271a4dc03c0578dA4B2274A56c15Fc751f5EF'
const ASSET = '0x3600000000000000000000000000000000000000'
const AMOUNT = 100_000n
const RELEASE_AMOUNT = 50_000n

async function main() {
  await assertPersonalSavingsArcTestnetBuild()
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 5_042_002n) throw new Error('Refusing rehearsal on chain ' + network.chainId + '; expected Arc Testnet 5042002.')
  if (process.env.SAVINGS_ARC_TESTNET_REHEARSAL_CONFIRM !== 'REHEARSE_REVIEWED_ARC_TEST_SAVINGS_V1') {
    throw new Error('Explicit Arc Testnet savings rehearsal confirmation is missing.')
  }
  const [actor] = await ethers.getSigners()
  if (!actor) throw new Error('ARC_DEPLOYER_PRIVATE_KEY is unavailable.')
  if (await ethers.provider.getCode(VAULT) === '0x') throw new Error('Recorded Arc Testnet savings vault has no bytecode.')

  const token = new ethers.Contract(ASSET, [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
  ], actor)
  const vault = await ethers.getContractAt('PersonalSavingsVault', VAULT, actor)
  if (ethers.getAddress(await vault.asset()) !== ethers.getAddress(ASSET)) throw new Error('Vault asset mismatch.')
  const balance = await token.balanceOf(actor.address)
  if (balance < AMOUNT) throw new Error('Rehearsal wallet lacks 0.1 test USDC.')

  const allowance = await token.allowance(actor.address, VAULT)
  const approvalTransactions: string[] = []
  if (allowance < AMOUNT) {
    if (allowance > 0n) {
      const reset = await token.approve(VAULT, 0)
      await reset.wait()
      approvalTransactions.push(reset.hash)
    }
    const approval = await token.approve(VAULT, AMOUNT)
    await approval.wait()
    approvalTransactions.push(approval.hash)
  }

  const beforeManaged = await vault.totalManaged()
  const transaction = await vault.createPlan(AMOUNT, await vault.WEEKLY(), RELEASE_AMOUNT)
  const receipt = await transaction.wait()
  if (!receipt || receipt.status !== 1) throw new Error('Savings rehearsal transaction failed.')
  const event = receipt.logs.map(log => {
    try { return vault.interface.parseLog(log) } catch { return null }
  }).find(log => log?.name === 'PlanCreated')
  if (!event) throw new Error('Savings rehearsal receipt lacks PlanCreated.')
  const planId = event.args.planId
  const plan = await vault.plans(planId)
  if (ethers.getAddress(plan.owner) !== ethers.getAddress(actor.address)
    || plan.deposited !== AMOUNT || plan.withdrawn !== 0n || plan.releaseAmount !== RELEASE_AMOUNT
    || plan.interval !== 604800n || await vault.totalManaged() !== beforeManaged + AMOUNT) {
    throw new Error('Savings rehearsal state mismatch.')
  }

  console.log(JSON.stringify({
    network: 'Arc Testnet',
    chainId: Number(network.chainId),
    vault: VAULT,
    asset: ASSET,
    actor: actor.address,
    approvalTransactions,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    planId,
    amountUsdcUnits: String(AMOUNT),
    releaseAmountUsdcUnits: String(RELEASE_AMOUNT),
    cadenceSeconds: Number(plan.interval),
    firstReleaseAt: Number(plan.firstReleaseAt),
    totalManagedUsdcUnits: String(await vault.totalManaged()),
    publicDepositsEnabled: false,
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
