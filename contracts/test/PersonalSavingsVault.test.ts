import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { MockUSDC, PersonalSavingsVault, ReentrantUSDC } from '../typechain-types'

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

  it('rejects a zero or non-contract asset at construction', async () => {
    const [owner] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('PersonalSavingsVault')
    await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, 'InvalidAddress')
    await expect(factory.deploy(owner.address)).to.be.revertedWithCustomError(factory, 'InvalidAddress')
  })
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

  it('blocks a token callback during deposit without corrupting accounting', async () => {
    const [owner] = await ethers.getSigners()
    const token = await ethers.deployContract('ReentrantUSDC') as unknown as ReentrantUSDC
    const vault = await ethers.deployContract('PersonalSavingsVault', [token.target]) as unknown as PersonalSavingsVault
    await token.mint(owner.address, 10n * USDC)
    await token.approve(await vault.getAddress(), 10n * USDC)
    await token.armCallback(await vault.getAddress(), vault.interface.encodeFunctionData('createPlan', [USDC, await vault.WEEKLY(), USDC]))

    await vault.createPlan(10n * USDC, await vault.WEEKLY(), USDC)
    expect(await token.callbackBlocked()).to.equal(true)
    expect(await vault.totalManaged()).to.equal(10n * USDC)
    expect(await token.balanceOf(await vault.getAddress())).to.equal(10n * USDC)
  })
  it('supports monthly plans and keeps each position bound to its creator', async () => {
    const context = await fixture()
    const planId = await createPlan(context, 12n * USDC, 2n * USDC, await context.vault.MONTHLY())
    expect(await context.vault.planIdsPage(context.owner.address, 0, 1)).to.deep.equal([planId])
    await expect(context.vault.connect(context.outsider).withdraw(planId, 1)).to.be.revertedWithCustomError(context.vault, 'NotPlanOwner')
    await expect(context.vault.connect(context.outsider).requestEmergencyExit(planId)).to.be.revertedWithCustomError(context.vault, 'NotPlanOwner')
    await expect(context.vault.connect(context.outsider).completeEmergencyExit(planId)).to.be.revertedWithCustomError(context.vault, 'NotPlanOwner')
    await expect(context.vault.connect(context.owner).withdraw(planId, 1)).to.be.revertedWithCustomError(context.vault, 'NothingToWithdraw')
  })
  it('paginates lifetime plan history without hiding later plans', async () => {
    const context = await fixture()
    const first = await createPlan(context, 3n * USDC, USDC)
    const second = await createPlan(context, 4n * USDC, USDC)
    const third = await createPlan(context, 5n * USDC, USDC)

    expect(await context.vault.planCount(context.owner.address)).to.equal(3)
    expect(await context.vault.planIdsPage(context.owner.address, 0, 2)).to.deep.equal([first, second])
    expect(await context.vault.planIdsPage(context.owner.address, 2, 2)).to.deep.equal([third])
    expect(await context.vault.planIdsPage(context.owner.address, 3, 1)).to.deep.equal([])
    expect(await context.vault.planCount(context.outsider.address)).to.equal(0)
    expect(await context.vault.planIdsPage(context.outsider.address, 0, 1)).to.deep.equal([])
    await expect(context.vault.planIdsPage(context.owner.address, 0, 0)).to.be.revertedWithCustomError(context.vault, 'InvalidPageSize')
    await expect(context.vault.planIdsPage(context.owner.address, 0, 101)).to.be.revertedWithCustomError(context.vault, 'InvalidPageSize')
  })
  it('allows a delayed emergency exit without administrator control', async () => {
    const context = await fixture()
    const planId = await createPlan(context)
    await expect(context.vault.connect(context.owner).requestEmergencyExit(planId)).to.emit(context.vault, 'EmergencyExitRequested')
    const firstRequest = await context.vault.plans(planId)
    await expect(context.vault.connect(context.owner).requestEmergencyExit(planId)).to.be.revertedWithCustomError(context.vault, 'EmergencyExitAlreadyRequested')
    expect((await context.vault.plans(planId)).emergencyExitAt).to.equal(firstRequest.emergencyExitAt)
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
  it('does not account unsolicited tokens as managed savings', async () => {
    const context = await fixture()
    const planId = await createPlan(context)
    await context.token.mint(context.outsider.address, 2n * USDC)
    await context.token.connect(context.outsider).transfer(await context.vault.getAddress(), 2n * USDC)
    expect(await context.vault.totalManaged()).to.equal(10n * USDC)
    expect(await context.token.balanceOf(await context.vault.getAddress())).to.equal(12n * USDC)

    await context.vault.connect(context.owner).requestEmergencyExit(planId)
    await time.increaseTo((await context.vault.plans(planId)).emergencyExitAt)
    await context.vault.connect(context.owner).completeEmergencyExit(planId)
    expect(await context.vault.totalManaged()).to.equal(0)
    expect(await context.token.balanceOf(await context.vault.getAddress())).to.equal(2n * USDC)
  })
  it('rejects invalid amounts and unsupported schedules', async () => {
    const context = await fixture()
    await expect(context.vault.createPlan(0, await context.vault.WEEKLY(), 1)).to.be.revertedWithCustomError(context.vault, 'InvalidAmount')
    await expect(context.vault.createPlan(USDC, await context.vault.WEEKLY(), 2n * USDC)).to.be.revertedWithCustomError(context.vault, 'InvalidAmount')
    await expect(context.vault.createPlan(USDC, 1, USDC)).to.be.revertedWithCustomError(context.vault, 'InvalidCadence')
  })
})
