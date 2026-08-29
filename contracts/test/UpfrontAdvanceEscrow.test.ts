import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { MockUSDC, UpfrontAdvanceEscrow } from '../typechain-types'

const offerTypes = {
  UnderwritingOffer: [
    { name: 'provider', type: 'address' }, { name: 'termsHash', type: 'bytes32' },
    { name: 'intelligenceCommitment', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' },
    { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
    { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
  ],
}
const fundingTermsTypes = {
  FundingTerms: [
    { name: 'offerHash', type: 'bytes32' }, { name: 'funder', type: 'address' },
    { name: 'repaymentRecipient', type: 'address' }, { name: 'providerArcRecipient', type: 'address' },
    { name: 'platformTreasury', type: 'address' }, { name: 'advanceAmount', type: 'uint256' },
    { name: 'funderRepaymentAmount', type: 'uint256' }, { name: 'platformFeeAmount', type: 'uint256' },
    { name: 'deadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
  ],
}
const protectionTypes = {
  ProtectionAttestation: [
    { name: 'positionId', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
    { name: 'arcTermsHash', type: 'bytes32' }, { name: 'termsHash', type: 'bytes32' },
    { name: 'fundingTermsHash', type: 'bytes32' }, { name: 'arcRecipient', type: 'address' },
    { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' },
    { name: 'provider', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
    { name: 'advanceAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' },
    { name: 'deadline', type: 'uint48' },
  ],
}

describe('UpfrontAdvanceEscrow', () => {
  async function fixture() {
    const [owner, underwriter, protectionSigner, funder, provider, providerArc, treasury, outsider] = await ethers.getSigners()
    const token = await ethers.deployContract('MockUSDC') as unknown as MockUSDC
    const escrow = await ethers.deployContract('UpfrontAdvanceEscrow', [token.target, outsider.address, underwriter.address, protectionSigner.address, owner.address]) as unknown as UpfrontAdvanceEscrow
    await escrow.connect(owner).setFunderAllowed(funder.address, true)
    await escrow.connect(owner).setPaused(false)
    await token.mint(funder.address, 1_000_000_000n)
    await token.connect(funder).approve(await escrow.getAddress(), ethers.MaxUint256)
    const domain = { name: 'HashPayStream Upfront', version: '1', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await escrow.getAddress() }
    return { owner, underwriter, protectionSigner, funder, provider, providerArc, treasury, outsider, token, escrow, domain }
  }

  async function signedOffer(context: Awaited<ReturnType<typeof fixture>>, seed = 'offer-1', maxAdvanceBps = 3000) {
    const now = await time.latest()
    const offer = {
      provider: context.provider.address,
      termsHash: ethers.keccak256(ethers.toUtf8Bytes('agreement-terms')),
      intelligenceCommitment: ethers.keccak256(ethers.toUtf8Bytes('zeroscout-evidence')),
      protectedAmount: 100_000_000n,
      maxAdvanceBps,
      protectionDeadline: now + 3600,
      underwritingDeadline: now + 600,
      nonce: ethers.keccak256(ethers.toUtf8Bytes(seed)),
    }
    return { offer, signature: await context.underwriter.signTypedData(context.domain, offerTypes, offer) }
  }

  async function signedFunding(context: Awaited<ReturnType<typeof fixture>>, offer: Awaited<ReturnType<typeof signedOffer>>['offer'], advanceAmount = 30_000_000n) {
    const offerHash = await context.escrow.hashUnderwritingOffer(offer)
    const terms = {
      offerHash,
      funder: context.funder.address,
      repaymentRecipient: context.funder.address,
      providerArcRecipient: context.providerArc.address,
      platformTreasury: context.treasury.address,
      advanceAmount,
      funderRepaymentAmount: advanceAmount + 240_000n,
      platformFeeAmount: 1_060_000n,
      deadline: offer.underwritingDeadline,
      nonce: ethers.keccak256(ethers.toUtf8Bytes('funding-' + offerHash)),
    }
    return {
      terms,
      termsHash: await context.escrow.hashFundingTerms(terms),
      signature: await context.protectionSigner.signTypedData(context.domain, fundingTermsTypes, terms),
      providerSignature: await context.provider.signTypedData(context.domain, fundingTermsTypes, terms),
    }
  }

  async function fund(context: Awaited<ReturnType<typeof fixture>>, seed = 'offer-1', amount = 30_000_000n, maxAdvanceBps = 3000) {
    const signed = await signedOffer(context, seed, maxAdvanceBps)
    const funding = await signedFunding(context, signed.offer, amount)
    await context.escrow.connect(context.funder).fundAdvance(signed.offer, funding.terms, signed.signature, funding.signature, funding.providerSignature)
    return { ...signed, ...funding, positionId: await context.escrow.hashUnderwritingOffer(signed.offer) }
  }

  it('stores accepted economics and releases only after matching Arc protection', async () => {
    const context = await fixture()
    const funded = await fund(context)
    const position = await context.escrow.positions(funded.positionId)
    expect(position.funderRepaymentAmount).to.equal(funded.terms.funderRepaymentAmount)
    expect(position.platformFeeAmount).to.equal(funded.terms.platformFeeAmount)
    expect(position.providerArcRecipient).to.equal(context.providerArc.address)
    const observedAt = await time.latest()
    const attestation = {
      positionId: funded.positionId,
      arcAgreementHash: ethers.keccak256(ethers.toUtf8Bytes('arc-agreement')),
      arcTermsHash: ethers.keccak256(ethers.toUtf8Bytes('arc-terms')),
      termsHash: funded.offer.termsHash,
      fundingTermsHash: funded.termsHash,
      arcRecipient: context.outsider.address,
      funder: context.funder.address,
      repaymentRecipient: context.funder.address,
      provider: context.provider.address,
      protectedAmount: funded.offer.protectedAmount,
      advanceAmount: funded.terms.advanceAmount,
      observedAt,
      deadline: observedAt + 300,
    }
    const signature = await context.protectionSigner.signTypedData(context.domain, protectionTypes, attestation)
    await expect(context.escrow.releaseAdvance(attestation, signature)).to.emit(context.escrow, 'AdvanceReleased')
    expect(await context.token.balanceOf(context.provider.address)).to.equal(funded.terms.advanceAmount)
  })

  it('rejects fee tampering and provider signatures from another wallet', async () => {
    const context = await fixture()
    const signed = await signedOffer(context)
    const funding = await signedFunding(context, signed.offer)
    await expect(context.escrow.connect(context.funder).fundAdvance(signed.offer, { ...funding.terms, platformFeeAmount: funding.terms.platformFeeAmount + 1n }, signed.signature, funding.signature, funding.providerSignature))
      .to.be.revertedWithCustomError(context.escrow, 'InvalidSignature')
    const outsiderSignature = await context.outsider.signTypedData(context.domain, fundingTermsTypes, funding.terms)
    await expect(context.escrow.connect(context.funder).fundAdvance(signed.offer, funding.terms, signed.signature, funding.signature, outsiderSignature))
      .to.be.revertedWithCustomError(context.escrow, 'InvalidSignature')
  })

  it('rejects an advance above the underwriting cap', async () => {
    const context = await fixture()
    const signed = await signedOffer(context)
    const funding = await signedFunding(context, signed.offer, 30_000_001n)
    await expect(context.escrow.connect(context.funder).fundAdvance(signed.offer, funding.terms, signed.signature, funding.signature, funding.providerSignature))
      .to.be.revertedWithCustomError(context.escrow, 'InvalidAmount')
  })

  it('returns an unreleased advance after the protection deadline', async () => {
    const context = await fixture()
    const funded = await fund(context, 'refund')
    await expect(context.escrow.connect(context.funder).refundAdvance(funded.positionId)).to.be.revertedWithCustomError(context.escrow, 'ProtectionNotExpired')
    await time.increaseTo(funded.offer.protectionDeadline + 1)
    await expect(context.escrow.connect(context.funder).refundAdvance(funded.positionId)).to.emit(context.escrow, 'AdvanceRefunded')
    expect(await context.token.balanceOf(context.funder.address)).to.equal(1_000_000_000n)
  })

  it('enforces the funder allowlist, pause, and one-use offer boundary', async () => {
    const context = await fixture()
    const signed = await signedOffer(context)
    const funding = await signedFunding(context, signed.offer)
    await context.escrow.connect(context.owner).setPaused(true)
    await expect(context.escrow.connect(context.funder).fundAdvance(signed.offer, funding.terms, signed.signature, funding.signature, funding.providerSignature)).to.be.revertedWithCustomError(context.escrow, 'EnforcedPause')
    await context.escrow.connect(context.owner).setPaused(false)
    await context.escrow.connect(context.funder).fundAdvance(signed.offer, funding.terms, signed.signature, funding.signature, funding.providerSignature)
    await expect(context.escrow.connect(context.funder).fundAdvance(signed.offer, funding.terms, signed.signature, funding.signature, funding.providerSignature)).to.be.revertedWithCustomError(context.escrow, 'OfferAlreadyUsed')
  })
})
