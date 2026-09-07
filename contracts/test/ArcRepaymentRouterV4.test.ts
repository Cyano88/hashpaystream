import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { ArcRepaymentRouterV4, MockUSDC } from '../typechain-types'

const settlementTypes = {
  SplitSettlement: [
    { name: 'arcAgreementHash', type: 'bytes32' },
    { name: 'arcTermsHash', type: 'bytes32' },
    { name: 'funder', type: 'address' },
    { name: 'provider', type: 'address' },
    { name: 'treasury', type: 'address' },
    { name: 'funderAmount', type: 'uint256' },
    { name: 'providerAmount', type: 'uint256' },
    { name: 'treasuryAmount', type: 'uint256' },
    { name: 'observedAt', type: 'uint48' },
    { name: 'deadline', type: 'uint48' },
  ],
}

describe('ArcRepaymentRouterV4', () => {
  async function fixture() {
    const [owner, creditSigner, funder, provider, treasury, outsider] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC') as unknown as MockUSDC
    const router = await ethers.deployContract('ArcRepaymentRouterV4', [token.target, creditSigner.address, treasury.address, owner.address]) as unknown as ArcRepaymentRouterV4
    await router.connect(owner).setPaused(false)
    const domain = { name: 'HashPayStream Upfront Repayment', version: '4', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await router.getAddress() }
    return { owner, creditSigner, funder, provider, treasury, outsider, token, router, domain }
  }

  async function settlement(context: Awaited<ReturnType<typeof fixture>>, seed = 'agreement-1') {
    const observedAt = await time.latest()
    return {
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes(seed)),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc-terms')),
      funder: context.funder.address,
      provider: context.provider.address,
      treasury: context.treasury.address,
      funderAmount: 30_240_000n,
      providerAmount: 68_700_000n,
      treasuryAmount: 1_060_000n,
      observedAt,
      deadline: observedAt + 600,
    }
  }

  it('atomically pays the funder, provider, and HashPayStream treasury', async () => {
    const context = await fixture()
    const message = await settlement(context)
    await context.token.mint(await context.router.getAddress(), 100_000_000n)
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, message)
    await expect(context.router.connect(context.outsider).settleRepayment(message, signature))
      .to.emit(context.router, 'RepaymentSettled')
      .withArgs(message.arcAgreementHash, message.arcTermsHash, context.funder.address, context.provider.address, context.treasury.address, message.funderAmount, message.providerAmount, message.treasuryAmount)
    expect(await context.token.balanceOf(context.funder.address)).to.equal(message.funderAmount)
    expect(await context.token.balanceOf(context.provider.address)).to.equal(message.providerAmount)
    expect(await context.token.balanceOf(context.treasury.address)).to.equal(message.treasuryAmount)
    await expect(context.router.settleRepayment(message, signature)).to.be.revertedWithCustomError(context.router, 'AgreementAlreadyCredited')
  })

  it('rejects a tampered amount or signer', async () => {
    const context = await fixture()
    const message = await settlement(context)
    await context.token.mint(await context.router.getAddress(), 100_000_000n)
    const badSignature = await context.outsider.signTypedData(context.domain, settlementTypes, message)
    await expect(context.router.settleRepayment(message, badSignature)).to.be.revertedWithCustomError(context.router, 'InvalidSignature')
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, message)
    await expect(context.router.settleRepayment({ ...message, treasuryAmount: message.treasuryAmount + 1n }, signature)).to.be.revertedWithCustomError(context.router, 'InvalidSignature')
  })

  it('rejects an unbacked, expired, or non-distinct split', async () => {
    const context = await fixture()
    const message = await settlement(context)
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, message)
    await expect(context.router.settleRepayment(message, signature)).to.be.revertedWithCustomError(context.router, 'InsufficientRepaymentBalance')
    await time.increaseTo(message.deadline + 1)
    await expect(context.router.settleRepayment(message, signature)).to.be.revertedWithCustomError(context.router, 'InvalidCredit')
    const invalid = { ...await settlement(context, 'agreement-2'), treasury: context.provider.address }
    const invalidSignature = await context.creditSigner.signTypedData(context.domain, settlementTypes, invalid)
    await expect(context.router.settleRepayment(invalid, invalidSignature)).to.be.revertedWithCustomError(context.router, 'InvalidCredit')
  })

  it('starts paused and requires the owner to enable settlement', async () => {
    const [owner, creditSigner, , , treasury] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC')
    const router = await ethers.deployContract('ArcRepaymentRouterV4', [
      token.target,
      creditSigner.address,
      treasury.address,
      owner.address,
    ])
    expect(await router.paused()).to.equal(true)
    await expect(router.connect(creditSigner).setPaused(false))
      .to.be.revertedWithCustomError(router, 'OwnableUnauthorizedAccount')
    await router.connect(owner).setPaused(false)
    expect(await router.paused()).to.equal(false)
  })

  it('cannot redirect the platform share to another treasury', async () => {
    const context = await fixture()
    const message = { ...await settlement(context), treasury: context.outsider.address }
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, message)
    await expect(context.router.settleRepayment(message, signature))
      .to.be.revertedWithCustomError(context.router, 'TreasuryMismatch')
  })

  it('accepts an ERC-1271 contract as the credit signer', async () => {
    const context = await fixture()
    const signingWallet = await ethers.deployContract('MockERC1271Signer', [context.creditSigner.address])
    await context.router.connect(context.owner).setCreditSigner(await signingWallet.getAddress())
    const message = await settlement(context, 'erc-1271')
    await context.token.mint(await context.router.getAddress(), 100_000_000n)
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, message)
    await expect(context.router.settleRepayment(message, signature))
      .to.emit(context.router, 'RepaymentSettled')
  })
})

