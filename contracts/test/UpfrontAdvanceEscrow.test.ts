import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { MockUSDC, UpfrontAdvanceEscrow } from '../typechain-types'

const offerTypes = {
  UnderwritingOffer: [
    { name: 'provider', type: 'address' },
    { name: 'termsHash', type: 'bytes32' },
    { name: 'intelligenceCommitment', type: 'bytes32' },
    { name: 'protectedAmount', type: 'uint256' },
    { name: 'maxAdvanceBps', type: 'uint16' },
    { name: 'protectionDeadline', type: 'uint48' },
    { name: 'underwritingDeadline', type: 'uint48' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

const protectionTypes = {
  ProtectionAttestation: [
    { name: 'positionId', type: 'bytes32' },
    { name: 'arcAgreementHash', type: 'bytes32' },
    { name: 'arcTermsHash', type: 'bytes32' },
    { name: 'termsHash', type: 'bytes32' },
    { name: 'arcRecipient', type: 'address' },
    { name: 'funder', type: 'address' },
    { name: 'repaymentRecipient', type: 'address' },
    { name: 'provider', type: 'address' },
    { name: 'protectedAmount', type: 'uint256' },
    { name: 'advanceAmount', type: 'uint256' },
    { name: 'observedAt', type: 'uint48' },
    { name: 'deadline', type: 'uint48' },
  ],
}

describe('UpfrontAdvanceEscrow', () => {
  async function fixture() {
    const [owner, underwriter, protectionSigner, funder, provider, outsider] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC') as unknown as MockUSDC
    const escrow = await ethers.deployContract('UpfrontAdvanceEscrow', [
      token.target,
      outsider.address,
      underwriter.address,
      protectionSigner.address,
      owner.address,
    ]) as unknown as UpfrontAdvanceEscrow
    await escrow.connect(owner).setFunderAllowed(funder.address, true)
    await escrow.connect(owner).setPaused(false)
    await token.mint(funder.address, 1_000_000_000n)
    await token.connect(funder).approve(await escrow.getAddress(), ethers.MaxUint256)
    const chainId = (await ethers.provider.getNetwork()).chainId
    const domain = {
      name: 'HashPayStream Upfront',
      version: '1',
      chainId,
      verifyingContract: await escrow.getAddress(),
    }
    return { owner, underwriter, protectionSigner, funder, provider, outsider, arcRecipient: outsider.address, repaymentRecipient: owner.address, token, escrow, domain }
  }

  async function signedOffer(context: Awaited<ReturnType<typeof fixture>>, nonceSeed = 'offer-1', maxAdvanceBps = 3000) {
    const now = await time.latest()
    const offer = {
      provider: context.provider.address,
      termsHash: ethers.keccak256(ethers.toUtf8Bytes('agreement-terms')),
      intelligenceCommitment: ethers.keccak256(ethers.toUtf8Bytes('zeroscout-evidence')),
      protectedAmount: 100_000_000n,
      maxAdvanceBps,
      protectionDeadline: now + 3600,
      underwritingDeadline: now + 600,
      nonce: ethers.keccak256(ethers.toUtf8Bytes(nonceSeed)),
    }
    return {
      offer,
      signature: await context.underwriter.signTypedData(context.domain, offerTypes, offer),
    }
  }

  it('escrows a funder advance and releases only after matching Arc protection', async () => {
    const context = await fixture()
    const { offer, signature } = await signedOffer(context)
    const advanceAmount = 30_000_000n
    const positionId = await context.escrow.hashUnderwritingOffer(offer)

    await expect(context.escrow.connect(context.funder).fundAdvance(offer, advanceAmount, context.repaymentRecipient, signature))
      .to.emit(context.escrow, 'AdvanceFunded')
      .withArgs(
        positionId,
        context.funder.address,
        context.provider.address,
        context.repaymentRecipient,
        offer.protectedAmount,
        advanceAmount,
        offer.termsHash,
        offer.intelligenceCommitment,
        offer.protectionDeadline,
      )
    expect(await context.token.balanceOf(context.escrow.target)).to.equal(advanceAmount)

    const observedAt = await time.latest()
    const attestation = {
      positionId,
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('agr_hashpaystream_123')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc-terms')),
      termsHash: offer.termsHash,
      arcRecipient: context.arcRecipient,
      funder: context.funder.address,
      repaymentRecipient: context.repaymentRecipient,
      provider: context.provider.address,
      protectedAmount: offer.protectedAmount,
      advanceAmount,
      observedAt,
      deadline: observedAt + 600,
    }
    const protectionSignature = await context.protectionSigner.signTypedData(context.domain, protectionTypes, attestation)
    await context.escrow.connect(context.owner).setPaused(true)
    await expect(context.escrow.releaseAdvance(attestation, protectionSignature))
      .to.be.revertedWithCustomError(context.escrow, 'EnforcedPause')
    await context.escrow.connect(context.owner).setPaused(false)
    await expect(context.escrow.connect(context.outsider).releaseAdvance(attestation, protectionSignature))
      .to.emit(context.escrow, 'AdvanceReleased')
      .withArgs(positionId, attestation.arcAgreementHash, context.provider.address, advanceAmount)

    expect(await context.token.balanceOf(context.provider.address)).to.equal(advanceAmount)
    expect((await context.escrow.positions(positionId)).status).to.equal(2)
    await expect(context.escrow.releaseAdvance(attestation, protectionSignature))
      .to.be.revertedWithCustomError(context.escrow, 'PositionNotFunded')
  })

  it('rejects an advance above the signed evidence cap', async () => {
    const context = await fixture()
    const { offer, signature } = await signedOffer(context)
    await expect(context.escrow.connect(context.funder).fundAdvance(offer, 30_000_001n, context.repaymentRecipient, signature))
      .to.be.revertedWithCustomError(context.escrow, 'InvalidAmount')
  })

  it('rejects protection signed by anyone except the signer snapshotted at funding', async () => {
    const context = await fixture()
    const { offer, signature } = await signedOffer(context)
    const advanceAmount = 20_000_000n
    const positionId = await context.escrow.hashUnderwritingOffer(offer)
    await context.escrow.connect(context.funder).fundAdvance(offer, advanceAmount, context.repaymentRecipient, signature)

    const observedAt = await time.latest()
    const attestation = {
      positionId,
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('agr_wrong_signer')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc-terms')),
      termsHash: offer.termsHash,
      arcRecipient: context.arcRecipient,
      funder: context.funder.address,
      repaymentRecipient: context.repaymentRecipient,
      provider: context.provider.address,
      protectedAmount: offer.protectedAmount,
      advanceAmount,
      observedAt,
      deadline: observedAt + 600,
    }
    const badSignature = await context.outsider.signTypedData(context.domain, protectionTypes, attestation)
    await expect(context.escrow.releaseAdvance(attestation, badSignature))
      .to.be.revertedWithCustomError(context.escrow, 'InvalidSignature')
  })

  it('returns escrowed funds to the funder if Arc protection never arrives', async () => {
    const context = await fixture()
    const { offer, signature } = await signedOffer(context, 'refund-offer')
    const advanceAmount = 25_000_000n
    const positionId = await context.escrow.hashUnderwritingOffer(offer)
    await context.escrow.connect(context.funder).fundAdvance(offer, advanceAmount, context.repaymentRecipient, signature)
    await expect(context.escrow.connect(context.funder).refundAdvance(positionId))
      .to.be.revertedWithCustomError(context.escrow, 'ProtectionNotExpired')

    await time.increaseTo(offer.protectionDeadline + 1)
    await expect(context.escrow.connect(context.funder).refundAdvance(positionId))
      .to.emit(context.escrow, 'AdvanceRefunded')
      .withArgs(positionId, context.funder.address, advanceAmount)
    expect((await context.escrow.positions(positionId)).status).to.equal(3)
  })

  it('starts paused and permits funding only from an allowlisted funder', async () => {
    const context = await fixture()
    const { offer, signature } = await signedOffer(context)
    await context.escrow.connect(context.owner).setPaused(true)
    await expect(context.escrow.connect(context.funder).fundAdvance(offer, 10_000_000n, context.repaymentRecipient, signature))
      .to.be.revertedWithCustomError(context.escrow, 'EnforcedPause')
    await context.escrow.connect(context.owner).setPaused(false)
    await expect(context.escrow.connect(context.outsider).fundAdvance(offer, 10_000_000n, context.repaymentRecipient, signature))
      .to.be.revertedWithCustomError(context.escrow, 'FunderNotAllowed')
  })

  it('uses each signed offer as the funding boundary without a global spending cap', async () => {
    const context = await fixture()
    for (const nonce of ['production-1', 'production-2', 'production-3']) {
      const signed = await signedOffer(context, nonce, 8000)
      await context.escrow.connect(context.funder).fundAdvance(
        signed.offer,
        80_000_000n,
        context.repaymentRecipient,
        signed.signature,
      )
    }
    expect(await context.token.balanceOf(context.escrow.target)).to.equal(240_000_000n)
  })
})
