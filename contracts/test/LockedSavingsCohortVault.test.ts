import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { LockedSavingsCohortVault, MockUSDC } from '../typechain-types'

const USDC = 1_000_000n

describe('LockedSavingsCohortVault', () => {
  async function fixture() {
    const [alice, bob, carol, outsider] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC') as unknown as MockUSDC
    const vault = await ethers.deployContract('LockedSavingsCohortVault', [token.target]) as unknown as LockedSavingsCohortVault
    for (const signer of [alice, bob, carol]) {
      await token.mint(signer.address, 1_000n * USDC)
      await token.connect(signer).approve(await vault.getAddress(), ethers.MaxUint256)
    }
    return { alice, bob, carol, outsider, token, vault }
  }

  async function deposit(context: Awaited<ReturnType<typeof fixture>>, signer: typeof context.alice, amount: bigint, duration?: bigint) {
    const term = duration ?? await context.vault.THIRTY_DAYS()
    const [cohortId] = await context.vault.nextCohort(term)
    await context.vault.connect(signer).deposit(amount, term)
    return cohortId
  }

  it('creates deterministic weekly cohorts for only the reviewed terms', async () => {
    const { vault } = await fixture()
    const interval = await vault.COHORT_INTERVAL()
    const duration = await vault.NINETY_DAYS()
    const now = BigInt(await time.latest())
    const [cohortId, startsAt, maturesAt] = await vault.nextCohort(duration)
    expect(startsAt).to.equal(((now / interval) + 1n) * interval)
    expect(maturesAt).to.equal(startsAt + duration)
    expect(cohortId).not.to.equal(ethers.ZeroHash)
    await expect(vault.nextCohort(31n * 24n * 60n * 60n)).to.be.revertedWithCustomError(vault, 'InvalidDuration')
  })

  it('aggregates deposits into one owner position and allows a full pre-start cancellation', async () => {
    const context = await fixture()
    const cohortId = await deposit(context, context.alice, 10n * USDC)
    await context.vault.connect(context.alice).deposit(5n * USDC, await context.vault.THIRTY_DAYS())
    expect((await context.vault.positions(cohortId, context.alice.address)).principal).to.equal(15n * USDC)
    expect((await context.vault.cohorts(cohortId)).activePositions).to.equal(1)
    await expect(context.vault.connect(context.outsider).cancelBeforeStart(cohortId)).to.be.revertedWithCustomError(context.vault, 'NoPosition')
    await expect(context.vault.connect(context.alice).cancelBeforeStart(cohortId)).to.emit(context.vault, 'PreStartDepositCancelled')
    expect(await context.token.balanceOf(context.alice.address)).to.equal(1_000n * USDC)
    expect(await context.vault.totalManaged()).to.equal(0)
  })

  it('charges exactly 5% on a full early exit while another saver remains', async () => {
    const context = await fixture()
    const cohortId = await deposit(context, context.alice, 100n * USDC)
    await deposit(context, context.bob, 100n * USDC)
    const cohort = await context.vault.cohorts(cohortId)
    await time.increaseTo(cohort.startsAt)

    expect(await context.vault.previewEarlyExit(cohortId, context.alice.address)).to.deep.equal([95n * USDC, 5n * USDC])
    await expect(context.vault.connect(context.alice).exitEarly(cohortId))
      .to.emit(context.vault, 'EarlyExit')
      .withArgs(cohortId, context.alice.address, 100n * USDC, 5n * USDC, 95n * USDC)
    expect(await context.token.balanceOf(context.alice.address)).to.equal(995n * USDC)
    expect((await context.vault.cohorts(cohortId)).rewardPool).to.equal(5n * USDC)
    expect(await context.vault.totalManaged()).to.equal(105n * USDC)
    await expect(context.vault.connect(context.alice).exitEarly(cohortId)).to.be.revertedWithCustomError(context.vault, 'NoPosition')
  })

  it('refunds only each saver own penalty at maturity if nobody completes the cohort', async () => {
    const context = await fixture()
    const cohortId = await deposit(context, context.alice, 100n * USDC)
    await deposit(context, context.bob, 100n * USDC)
    const cohort = await context.vault.cohorts(cohortId)
    await time.increaseTo(cohort.startsAt)
    await context.vault.connect(context.alice).exitEarly(cohortId)
    await expect(context.vault.connect(context.bob).exitEarly(cohortId))
      .to.emit(context.vault, 'EarlyExit')
      .withArgs(cohortId, context.bob.address, 100n * USDC, 5n * USDC, 95n * USDC)
    expect(await context.token.balanceOf(context.bob.address)).to.equal(995n * USDC)
    expect(await context.vault.totalManaged()).to.equal(10n * USDC)
    await expect(context.vault.connect(context.alice).claimPenaltyRefund(cohortId)).to.be.revertedWithCustomError(context.vault, 'CohortNotMatured')
    await time.increaseTo(cohort.maturesAt)
    await expect(context.vault.connect(context.alice).claimPenaltyRefund(cohortId)).to.emit(context.vault, 'PenaltyRefunded').withArgs(cohortId, context.alice.address, 5n * USDC)
    await expect(context.vault.connect(context.bob).claimPenaltyRefund(cohortId)).to.emit(context.vault, 'PenaltyRefunded').withArgs(cohortId, context.bob.address, 5n * USDC)
    expect(await context.token.balanceOf(context.alice.address)).to.equal(1_000n * USDC)
    expect(await context.token.balanceOf(context.bob.address)).to.equal(1_000n * USDC)
    expect(await context.vault.totalManaged()).to.equal(0)
  })

  it('pays completers pro rata and assigns rounding dust to the final claimant', async () => {
    const context = await fixture()
    const cohortId = await deposit(context, context.alice, 101n * USDC)
    await deposit(context, context.bob, 299n * USDC)
    await deposit(context, context.carol, 100n * USDC)
    const cohort = await context.vault.cohorts(cohortId)
    await time.increaseTo(cohort.startsAt)
    await context.vault.connect(context.carol).exitEarly(cohortId)
    const afterExit = await context.vault.cohorts(cohortId)
    expect(afterExit.rewardPool).to.equal(5n * USDC)
    await time.increaseTo(cohort.maturesAt)

    const aliceBefore = await context.token.balanceOf(context.alice.address)
    await context.vault.connect(context.alice).claim(cohortId)
    const aliceReward = (5n * USDC * 101n) / 400n
    expect(await context.token.balanceOf(context.alice.address)).to.equal(aliceBefore + 101n * USDC + aliceReward)

    const bobBefore = await context.token.balanceOf(context.bob.address)
    await context.vault.connect(context.bob).claim(cohortId)
    expect(await context.token.balanceOf(context.bob.address)).to.equal(bobBefore + 299n * USDC + (5n * USDC - aliceReward))
    expect(await context.vault.totalManaged()).to.equal(0)
    expect((await context.vault.cohorts(cohortId)).rewardsPaid).to.equal(5n * USDC)
    await expect(context.vault.connect(context.bob).claim(cohortId)).to.be.revertedWithCustomError(context.vault, 'NoPosition')
  })

  it('isolates rewards by duration and never accounts unsolicited token transfers as savings', async () => {
    const context = await fixture()
    const thirtyId = await deposit(context, context.alice, 100n * USDC, await context.vault.THIRTY_DAYS())
    await deposit(context, context.bob, 100n * USDC, await context.vault.THIRTY_DAYS())
    const ninetyId = await deposit(context, context.carol, 100n * USDC, await context.vault.NINETY_DAYS())
    expect(thirtyId).not.to.equal(ninetyId)
    await context.token.mint(await context.vault.getAddress(), 7n * USDC)
    expect(await context.vault.totalManaged()).to.equal(300n * USDC)

    const thirty = await context.vault.cohorts(thirtyId)
    await time.increaseTo(thirty.startsAt)
    await context.vault.connect(context.alice).exitEarly(thirtyId)
    expect((await context.vault.cohorts(thirtyId)).rewardPool).to.equal(5n * USDC)
    expect((await context.vault.cohorts(ninetyId)).rewardPool).to.equal(0)
    await time.increaseTo(thirty.maturesAt)
    await context.vault.connect(context.bob).claim(thirtyId)
    expect(await context.token.balanceOf(context.bob.address)).to.equal(1_005n * USDC)

    const ninety = await context.vault.cohorts(ninetyId)
    await time.increaseTo(ninety.maturesAt)
    await context.vault.connect(context.carol).claim(ninetyId)
    expect(await context.vault.totalManaged()).to.equal(0)
    expect(await context.token.balanceOf(await context.vault.getAddress())).to.equal(7n * USDC)
  })
  it('enforces lifecycle boundaries, ownership, and the minimum deposit', async () => {
    const context = await fixture()
    await expect(context.vault.deposit(USDC - 1n, await context.vault.THIRTY_DAYS())).to.be.revertedWithCustomError(context.vault, 'InvalidAmount')
    const cohortId = await deposit(context, context.alice, USDC)
    await expect(context.vault.connect(context.outsider).exitEarly(cohortId)).to.be.revertedWithCustomError(context.vault, 'CohortNotStarted')
    const cohort = await context.vault.cohorts(cohortId)
    await time.increaseTo(cohort.startsAt)
    await expect(context.vault.connect(context.outsider).exitEarly(cohortId)).to.be.revertedWithCustomError(context.vault, 'NoPosition')
    await expect(context.vault.connect(context.alice).claim(cohortId)).to.be.revertedWithCustomError(context.vault, 'CohortNotMatured')
    await time.increaseTo(cohort.maturesAt)
    await expect(context.vault.connect(context.alice).exitEarly(cohortId)).to.be.revertedWithCustomError(context.vault, 'CohortMatured')
    await context.vault.connect(context.alice).claim(cohortId)
    expect(await context.token.balanceOf(context.alice.address)).to.equal(1_000n * USDC)
  })
})
