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

  it('carries all-exit penalties forward within the same duration and never refunds early exiters', async () => {
    const context = await fixture()
    const cohortId = await deposit(context, context.alice, 100n * USDC)
    await deposit(context, context.bob, 100n * USDC)
    const cohort = await context.vault.cohorts(cohortId)
    await time.increaseTo(cohort.startsAt)
    await context.vault.connect(context.alice).exitEarly(cohortId)
    await expect(context.vault.connect(context.bob).exitEarly(cohortId))
      .to.emit(context.vault, 'RewardsCarriedForward')
      .withArgs(cohortId, await context.vault.THIRTY_DAYS(), 10n * USDC)
    expect((await context.vault.cohorts(cohortId)).rewardPool).to.equal(0)
    expect(await context.vault.termRewardCarry(await context.vault.THIRTY_DAYS())).to.equal(10n * USDC)
    expect(await context.vault.totalManaged()).to.equal(10n * USDC)
    expect(await context.token.balanceOf(context.alice.address)).to.equal(995n * USDC)
    expect(await context.token.balanceOf(context.bob.address)).to.equal(995n * USDC)

    await time.increase(7n * 24n * 60n * 60n)
    const nextId = await deposit(context, context.carol, 100n * USDC)
    const next = await context.vault.cohorts(nextId)
    await time.increaseTo(next.maturesAt)
    await context.vault.connect(context.carol).claim(nextId)
    expect(await context.token.balanceOf(context.carol.address)).to.equal(1_005n * USDC)
    expect(await context.vault.termRewardCarry(await context.vault.THIRTY_DAYS())).to.equal(5n * USDC)
    expect(await context.vault.totalManaged()).to.equal(5n * USDC)
  })

  it('limits reward carry captured by a cohort when another completer does not claim', async () => {
    const context = await fixture()
    const exitedId = await deposit(context, context.alice, 100n * USDC)
    await deposit(context, context.bob, 100n * USDC)
    const exited = await context.vault.cohorts(exitedId)
    await time.increaseTo(exited.startsAt)
    await context.vault.connect(context.alice).exitEarly(exitedId)
    await context.vault.connect(context.bob).exitEarly(exitedId)
    expect(await context.vault.termRewardCarry(await context.vault.THIRTY_DAYS())).to.equal(10n * USDC)

    await time.increase(7n * 24n * 60n * 60n)
    const nextId = await deposit(context, context.alice, 1n * USDC)
    await deposit(context, context.carol, 1n * USDC)
    const next = await context.vault.cohorts(nextId)
    await time.increaseTo(next.maturesAt)
    await expect(context.vault.connect(context.carol).claim(nextId))
      .to.emit(context.vault, 'RewardsApplied')
      .withArgs(nextId, await context.vault.THIRTY_DAYS(), 100_000n)
    expect(await context.vault.termRewardCarry(await context.vault.THIRTY_DAYS())).to.equal(9_900_000n)
    expect((await context.vault.cohorts(nextId)).rewardPool).to.equal(100_000n)
    expect((await context.vault.cohorts(nextId)).rewardsPaid).to.equal(50_000n)
    expect(await context.vault.totalManaged()).to.equal(10_950_000n)
  })
  it('caps a completer reward so a tiny second wallet cannot reclaim a large penalty', async () => {
    const context = await fixture()
    const cohortId = await deposit(context, context.alice, 99n * USDC)
    await deposit(context, context.bob, 1n * USDC)
    const cohort = await context.vault.cohorts(cohortId)
    await time.increaseTo(cohort.startsAt)
    await context.vault.connect(context.alice).exitEarly(cohortId)
    await time.increaseTo(cohort.maturesAt)

    const bobBefore = await context.token.balanceOf(context.bob.address)
    await context.vault.connect(context.bob).claim(cohortId)
    expect(await context.token.balanceOf(context.bob.address)).to.equal(bobBefore + 1_050_000n)
    expect(await context.vault.termRewardCarry(await context.vault.THIRTY_DAYS())).to.equal(4_900_000n)
    expect(await context.vault.totalManaged()).to.equal(4_900_000n)
  })

  it('pays completers pro rata and carries rounding dust forward', async () => {
    const context = await fixture()
    const cohortId = await deposit(context, context.alice, 101n * USDC)
    await deposit(context, context.bob, 300n * USDC)
    await deposit(context, context.carol, 100n * USDC)
    const cohort = await context.vault.cohorts(cohortId)
    await time.increaseTo(cohort.startsAt)
    await context.vault.connect(context.carol).exitEarly(cohortId)
    const afterExit = await context.vault.cohorts(cohortId)
    expect(afterExit.rewardPool).to.equal(5n * USDC)
    await time.increaseTo(cohort.maturesAt)

    const aliceBefore = await context.token.balanceOf(context.alice.address)
    await context.vault.connect(context.alice).claim(cohortId)
    const aliceReward = (5n * USDC * 101n) / 401n
    expect(await context.token.balanceOf(context.alice.address)).to.equal(aliceBefore + 101n * USDC + aliceReward)

    const bobBefore = await context.token.balanceOf(context.bob.address)
    await context.vault.connect(context.bob).claim(cohortId)
    const bobReward = (5n * USDC * 300n) / 401n
    expect(await context.token.balanceOf(context.bob.address)).to.equal(bobBefore + 300n * USDC + bobReward)
    expect(await context.vault.totalManaged()).to.equal(5n * USDC - aliceReward - bobReward)
    expect(await context.vault.termRewardCarry(await context.vault.THIRTY_DAYS())).to.equal(5n * USDC - aliceReward - bobReward)
    expect((await context.vault.cohorts(cohortId)).rewardsPaid).to.equal(aliceReward + bobReward)
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
  it('preserves token accounting and the reward cap across varied deposit sizes', async () => {
    for (let round = 0n; round < 8n; round += 1n) {
      const context = await fixture()
      const alicePrincipal = (10n + round) * USDC + round
      const bobPrincipal = (3n + 2n * round) * USDC + 17n * round + 1n
      const completerPrincipal = (1n + round) * USDC + 31n * round + 3n
      const cohortId = await deposit(context, context.alice, alicePrincipal)
      await deposit(context, context.bob, bobPrincipal)
      await deposit(context, context.carol, completerPrincipal)
      const cohort = await context.vault.cohorts(cohortId)
      await time.increaseTo(cohort.startsAt)
      await context.vault.connect(context.alice).exitEarly(cohortId)
      await context.vault.connect(context.bob).exitEarly(cohortId)
      await time.increaseTo(cohort.maturesAt)
      await context.vault.connect(context.carol).claim(cohortId)

      const penalties = (alicePrincipal * 500n) / 10_000n + (bobPrincipal * 500n) / 10_000n
      const rewardCap = (completerPrincipal * 500n) / 10_000n
      const reward = penalties < rewardCap ? penalties : rewardCap
      const carry = penalties - reward
      const vaultBalance = await context.token.balanceOf(await context.vault.getAddress())
      expect(vaultBalance).to.equal(carry)
      expect(await context.vault.totalManaged()).to.equal(carry)
      expect(await context.vault.termRewardCarry(await context.vault.THIRTY_DAYS())).to.equal(carry)
      expect(
        await context.token.balanceOf(context.alice.address) +
        await context.token.balanceOf(context.bob.address) +
        await context.token.balanceOf(context.carol.address) +
        vaultBalance,
      ).to.equal(await context.token.totalSupply())
    }
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
