import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { MockUSDC, PersonalSavingsVault } from '../typechain-types'

const USDC = 1_000_000n

describe('PersonalSavingsVault', () => {
  async function fixture() {
    const [owner, outsider] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC') as unknown as MockUSDC
    const vault = await ethers.deployContract('PersonalSavingsVault', [token.target]) as unknown as PersonalSavingsVault
    await token.mint(owner.address, 100n * USDC)
    await token.connect(owner).approve(await vault.getAddress(), ethers.MaxUint256)
    return { owner, outsider, token, vault }
  }

  async function createPlan(context: Awaited<ReturnType<typeof fixture>>, amount = 10n * USDC, release = 3n * USDC, cadence?: bigint) {
    const interval = cadence ?? await context.vault.WEEKLY()
    const tx = await context.vault.connect(context.owner).createPlan(amount, interval, release)
    const receipt = await tx.wait()
    const event = receipt?.logs.map(log => {
      try { return context.vault.interface.parseLog(log) } catch { return null }
    }).find(item => item?.name === 'PlanCreated')
    return event!.args.planId as string
  }

  it('locks native USDC and releases the exact weekly allowance', async () => {
    const context = await fixture()
    const planId = await createPlan(context)
    const plan = await context.vault.plans(planId)
    expect(await context.vault.totalManaged()).to.equal(10n * USDC)
    expect(await context.vault.withdrawable(planId)).to.equal(0)
    await time.increaseTo(plan.firstReleaseAt)
    expect(await context.vault.withdrawable(planId)).to.equal(3n * USDC)
    await context.vault.connect(context.owner).withdraw(planId, 3n * USDC)
    expect(await context.token.balanceOf(context.owner.address)).to.equal(93n * USDC)
    await time.increase(21 * 24 * 60 * 60)
    expect(await context.vault.withdrawable(planId)).to.equal(7n * USDC)
    await context.vault.connect(context.owner).withdraw(planId, 7n * USDC)
    expect(await context.vault.remaining(planId)).to.equal(0)
    expect(await context.vault.totalManaged()).to.equal(0)
  })

  it('supports monthly plans and keeps each position bound to its creator', async () => {
    const context = await fixture()
    const planId = await createPlan(context, 12n * USDC, 2n * USDC, await context.vault.MONTHLY())
    expect(await context.vault.planIds(context.owner.address)).to.deep.equal([planId])
    await expect(context.vault.connect(context.outsider).withdraw(planId, 1)).to.be.revertedWithCustomError(context.vault, 'NotPlanOwner')
    await expect(context.vault.connect(context.outsider).requestEmergencyExit(planId)).to.be.revertedWithCustomError(context.vault, 'NotPlanOwner')
    await expect(context.vault.connect(context.outsider).completeEmergencyExit(planId)).to.be.revertedWithCustomError(context.vault, 'NotPlanOwner')
    await expect(context.vault.connect(context.owner).withdraw(planId, 1)).to.be.revertedWithCustomError(context.vault, 'NothingToWithdraw')
  })
  it('allows a delayed emergency exit without administrator control', async () => {
    const context = await fixture()
    const planId = await createPlan(context)
    await expect(context.vault.connect(context.owner).requestEmergencyExit(planId)).to.emit(context.vault, 'EmergencyExitRequested')
    await expect(context.vault.connect(context.owner).completeEmergencyExit(planId)).to.be.revertedWithCustomError(context.vault, 'EmergencyExitNotReady')
    const plan = await context.vault.plans(planId)
    await time.increaseTo(plan.emergencyExitAt)
    await expect(context.vault.connect(context.owner).completeEmergencyExit(planId)).to.emit(context.vault, 'EmergencyExitCompleted')
    expect(await context.token.balanceOf(context.owner.address)).to.equal(100n * USDC)
  })

  it('cancels emergency access and preserves solvency across partial and final withdrawals', async () => {
    const context = await fixture()
    const planId = await createPlan(context)
    await context.vault.connect(context.owner).requestEmergencyExit(planId)
    await expect(context.vault.connect(context.outsider).cancelEmergencyExit(planId)).to.be.revertedWithCustomError(context.vault, 'NotPlanOwner')
    await expect(context.vault.connect(context.owner).cancelEmergencyExit(planId)).to.emit(context.vault, 'EmergencyExitCancelled')
    expect((await context.vault.plans(planId)).emergencyExitAt).to.equal(0)

    const plan = await context.vault.plans(planId)
    await time.increaseTo(plan.firstReleaseAt)
    await context.vault.connect(context.owner).withdraw(planId, 2n * USDC)
    expect(await context.vault.totalManaged()).to.equal(8n * USDC)
    expect(await context.token.balanceOf(await context.vault.getAddress())).to.equal(8n * USDC)

    await context.vault.connect(context.owner).requestEmergencyExit(planId)
    const requested = await context.vault.plans(planId)
    await time.increaseTo(requested.emergencyExitAt)
    await context.vault.connect(context.owner).completeEmergencyExit(planId)
    expect(await context.vault.remaining(planId)).to.equal(0)
    expect(await context.vault.totalManaged()).to.equal(0)
    expect(await context.token.balanceOf(await context.vault.getAddress())).to.equal(0)
    expect(await context.token.balanceOf(context.owner.address)).to.equal(100n * USDC)
  })
  it('rejects invalid amounts and unsupported schedules', async () => {
    const context = await fixture()
    await expect(context.vault.createPlan(0, await context.vault.WEEKLY(), 1)).to.be.revertedWithCustomError(context.vault, 'InvalidAmount')
    await expect(context.vault.createPlan(USDC, await context.vault.WEEKLY(), 2n * USDC)).to.be.revertedWithCustomError(context.vault, 'InvalidAmount')
    await expect(context.vault.createPlan(USDC, 1, USDC)).to.be.revertedWithCustomError(context.vault, 'InvalidCadence')
  })
})
