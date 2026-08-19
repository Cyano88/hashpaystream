import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { ArcRepaymentRouter, MockUSDC } from '../typechain-types'

const creditTypes = {
  RepaymentCredit: [
    { name: 'arcAgreementHash', type: 'bytes32' },
    { name: 'arcTermsHash', type: 'bytes32' },
    { name: 'funder', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'observedAt', type: 'uint48' },
    { name: 'deadline', type: 'uint48' },
  ],
}

describe('ArcRepaymentRouter', () => {
  async function fixture() {
    const [owner, creditSigner, funder, outsider] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC') as unknown as MockUSDC
    const router = await ethers.deployContract('ArcRepaymentRouter', [token.target, creditSigner.address, owner.address]) as unknown as ArcRepaymentRouter
    const domain = {
      name: 'HashPayStream Upfront Repayment', version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await router.getAddress(),
    }
    return { owner, creditSigner, funder, outsider, token, router, domain }
  }

  it('credits one confirmed Arc repayment and lets only the bound funder claim it', async () => {
    const context = await fixture()
    const amount = 100_000_000n
    await context.token.mint(await context.router.getAddress(), amount)
    const observedAt = await time.latest()
    const credit = {
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('agr_1')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc_terms_1')),
      funder: context.funder.address, amount, observedAt, deadline: observedAt + 600,
    }
    const signature = await context.creditSigner.signTypedData(context.domain, creditTypes, credit)
    await expect(context.router.connect(context.outsider).creditRepayment(credit, signature))
      .to.emit(context.router, 'RepaymentCredited')
      .withArgs(credit.arcAgreementHash, credit.arcTermsHash, context.funder.address, amount)
    await expect(context.router.creditRepayment(credit, signature)).to.be.revertedWithCustomError(context.router, 'AgreementAlreadyCredited')
    await expect(context.router.connect(context.funder).claim()).to.emit(context.router, 'RepaymentClaimed').withArgs(context.funder.address, amount)
    expect(await context.token.balanceOf(context.funder.address)).to.equal(amount)
  })

  it('rejects unbacked or incorrectly signed credits', async () => {
    const context = await fixture()
    const observedAt = await time.latest()
    const credit = {
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('agr_2')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc_terms_2')),
      funder: context.funder.address, amount: 50_000_000n, observedAt, deadline: observedAt + 600,
    }
    const badSignature = await context.outsider.signTypedData(context.domain, creditTypes, credit)
    await expect(context.router.creditRepayment(credit, badSignature)).to.be.revertedWithCustomError(context.router, 'InvalidSignature')
    const signature = await context.creditSigner.signTypedData(context.domain, creditTypes, credit)
    await expect(context.router.creditRepayment(credit, signature)).to.be.revertedWithCustomError(context.router, 'InsufficientRepaymentBalance')
  })
})
