import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { ArcRepaymentRouter, MockUSDC } from '../typechain-types'

const settlementTypes = {
  SplitSettlement: [
    { name: 'arcAgreementHash', type: 'bytes32' },
    { name: 'arcTermsHash', type: 'bytes32' },
    { name: 'funder', type: 'address' },
    { name: 'provider', type: 'address' },
    { name: 'funderAmount', type: 'uint256' },
    { name: 'providerAmount', type: 'uint256' },
    { name: 'observedAt', type: 'uint48' },
    { name: 'deadline', type: 'uint48' },
  ],
}

describe('ArcRepaymentRouter', () => {
  async function fixture() {
    const [owner, creditSigner, funder, provider, outsider] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC') as unknown as MockUSDC
    const router = await ethers.deployContract('ArcRepaymentRouter', [token.target, creditSigner.address, owner.address]) as unknown as ArcRepaymentRouter
    const domain = {
      name: 'HashPayStream Upfront Repayment', version: '2',
      chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await router.getAddress(),
    }
    return { owner, creditSigner, funder, provider, outsider, token, router, domain }
  }

  it('atomically repays the funder principal and sends the remainder to the provider', async () => {
    const context = await fixture()
    const funderAmount = 25_000_000n
    const providerAmount = 75_000_000n
    await context.token.mint(await context.router.getAddress(), funderAmount + providerAmount)
    const observedAt = await time.latest()
    const settlement = {
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('agr_1')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc_terms_1')),
      funder: context.funder.address, provider: context.provider.address,
      funderAmount, providerAmount, observedAt, deadline: observedAt + 600,
    }
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, settlement)
    await expect(context.router.connect(context.outsider).settleRepayment(settlement, signature))
      .to.emit(context.router, 'RepaymentSettled')
      .withArgs(settlement.arcAgreementHash, settlement.arcTermsHash, context.funder.address, context.provider.address, funderAmount, providerAmount)
    expect(await context.token.balanceOf(context.funder.address)).to.equal(funderAmount)
    expect(await context.token.balanceOf(context.provider.address)).to.equal(providerAmount)
    await expect(context.router.settleRepayment(settlement, signature)).to.be.revertedWithCustomError(context.router, 'AgreementAlreadyCredited')
  })

  it('rejects unbacked or incorrectly signed credits', async () => {
    const context = await fixture()
    const observedAt = await time.latest()
    const settlement = {
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('agr_2')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc_terms_2')),
      funder: context.funder.address, provider: context.provider.address,
      funderAmount: 10_000_000n, providerAmount: 40_000_000n, observedAt, deadline: observedAt + 600,
    }
    const badSignature = await context.outsider.signTypedData(context.domain, settlementTypes, settlement)
    await expect(context.router.settleRepayment(settlement, badSignature)).to.be.revertedWithCustomError(context.router, 'InvalidSignature')
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, settlement)
    await expect(context.router.settleRepayment(settlement, signature)).to.be.revertedWithCustomError(context.router, 'InsufficientRepaymentBalance')
  })

  it('rejects a settlement without a real split', async () => {
    const context = await fixture()
    const observedAt = await time.latest()
    const settlement = {
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('agr_3')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc_terms_3')),
      funder: context.funder.address, provider: context.provider.address,
      funderAmount: 50_000_000n, providerAmount: 0n, observedAt, deadline: observedAt + 600,
    }
    const signature = await context.creditSigner.signTypedData(context.domain, settlementTypes, settlement)
    await expect(context.router.settleRepayment(settlement, signature)).to.be.revertedWithCustomError(context.router, 'InvalidCredit')
  })
})
