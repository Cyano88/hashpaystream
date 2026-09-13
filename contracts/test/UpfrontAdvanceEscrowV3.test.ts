import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'

const offerTypes = { UnderwritingOffer: [
  { name: 'provider', type: 'address' }, { name: 'termsHash', type: 'bytes32' },
  { name: 'intelligenceCommitment', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' },
  { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
  { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] }
const fundingTypes = { FundingTerms: [
  { name: 'offerHash', type: 'bytes32' }, { name: 'funder', type: 'address' },
  { name: 'repaymentRecipient', type: 'address' }, { name: 'providerArcRecipient', type: 'address' },
  { name: 'platformTreasury', type: 'address' }, { name: 'advanceAsset', type: 'address' },
  { name: 'advanceTokenAmount', type: 'uint256' }, { name: 'advanceAmount', type: 'uint256' },
  { name: 'funderRepaymentAmount', type: 'uint256' }, { name: 'platformFeeAmount', type: 'uint256' },
  { name: 'deadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] }
const protectionTypes = { ProtectionAttestation: [
  { name: 'positionId', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
  { name: 'arcTermsHash', type: 'bytes32' }, { name: 'termsHash', type: 'bytes32' },
  { name: 'fundingTermsHash', type: 'bytes32' }, { name: 'arcRecipient', type: 'address' },
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' },
  { name: 'provider', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
  { name: 'advanceAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' },
  { name: 'deadline', type: 'uint48' },
] }

describe('UpfrontAdvanceEscrowV3', () => {
  async function fixture() {
    const [owner, underwriter, riskSigner, funder, worker, arcRecipient, treasury, router] = await ethers.getSigners()
    const usdc = await ethers.deployContract('MockUSDC')
    const stock = await ethers.deployContract('MockUSDC')
    const escrow = await ethers.deployContract('UpfrontAdvanceEscrowV3', [usdc.target, router.address, underwriter.address, riskSigner.address, owner.address])
    await escrow.connect(owner).setFunderAllowed(funder.address, true)
    await escrow.connect(owner).setAdvanceAssetAllowed(stock.target, true)
    await escrow.connect(owner).setPaused(false)
    await stock.mint(funder.address, 10_000_000n)
    await stock.connect(funder).approve(escrow.target, ethers.MaxUint256)
    const domain = { name: 'HashPayStream Upfront', version: '3', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: escrow.target }
    return { owner, underwriter, riskSigner, funder, worker, arcRecipient, treasury, router, usdc, stock, escrow, domain }
  }

  async function prepare(c: Awaited<ReturnType<typeof fixture>>, seed = 'one') {
    const now = await time.latest()
    const offer = { provider: c.worker.address, termsHash: ethers.id('job-terms'), intelligenceCommitment: ethers.id('market-and-participant-evidence'), protectedAmount: 100_000_000n, maxAdvanceBps: 3000, protectionDeadline: now + 3600, underwritingDeadline: now + 600, nonce: ethers.id(seed) }
    const offerSignature = await c.underwriter.signTypedData(c.domain, offerTypes, offer)
    const offerHash = await c.escrow.hashUnderwritingOffer(offer)
    const terms = { offerHash, funder: c.funder.address, repaymentRecipient: c.funder.address, providerArcRecipient: c.arcRecipient.address, platformTreasury: c.treasury.address, advanceAsset: c.stock.target, advanceTokenAmount: 250_000n, advanceAmount: 25_000_000n, funderRepaymentAmount: 25_200_000n, platformFeeAmount: 800_000n, deadline: offer.underwritingDeadline, nonce: ethers.id(`funding-${seed}`) }
    const termsHash = await c.escrow.hashFundingTerms(terms)
    return { offer, offerHash, offerSignature, terms, termsHash, riskSignature: await c.riskSigner.signTypedData(c.domain, fundingTypes, terms), workerSignature: await c.worker.signTypedData(c.domain, fundingTypes, terms) }
  }

  it('delivers stock while the funded job remains the sole USDC repayment source', async () => {
    const c = await fixture(); const p = await prepare(c)
    await c.escrow.connect(c.funder).fundAdvance(p.offer, p.terms, p.offerSignature, p.riskSignature, p.workerSignature)
    expect(await c.usdc.balanceOf(c.escrow.target)).to.equal(0)
    expect(await c.stock.balanceOf(c.escrow.target)).to.equal(p.terms.advanceTokenAmount)
    const position = await c.escrow.positions(p.offerHash)
    expect(position.advanceAsset).to.equal(c.stock.target)
    expect(position.advanceTokenAmount).to.equal(p.terms.advanceTokenAmount)
    const observedAt = await time.latest()
    const attestation = { positionId: p.offerHash, arcAgreementHash: ethers.id('arc-agreement'), arcTermsHash: ethers.id('arc-terms'), termsHash: p.offer.termsHash, fundingTermsHash: p.termsHash, arcRecipient: c.router.address, funder: c.funder.address, repaymentRecipient: c.funder.address, provider: c.worker.address, protectedAmount: p.offer.protectedAmount, advanceAmount: p.terms.advanceAmount, observedAt, deadline: observedAt + 300 }
    const signature = await c.riskSigner.signTypedData(c.domain, protectionTypes, attestation)
    await expect(c.escrow.releaseAdvance(attestation, signature)).to.emit(c.escrow, 'AdvanceReleased')
    expect(await c.stock.balanceOf(c.worker.address)).to.equal(p.terms.advanceTokenAmount)
    expect(await c.usdc.balanceOf(c.worker.address)).to.equal(0)
  })

  it('rejects an unapproved token and signed token-amount tampering', async () => {
    const c = await fixture(); const p = await prepare(c)
    await c.escrow.connect(c.owner).setAdvanceAssetAllowed(c.stock.target, false)
    await expect(c.escrow.connect(c.funder).fundAdvance(p.offer, p.terms, p.offerSignature, p.riskSignature, p.workerSignature)).to.be.revertedWithCustomError(c.escrow, 'AdvanceAssetNotAllowed')
    await c.escrow.connect(c.owner).setAdvanceAssetAllowed(c.stock.target, true)
    await expect(c.escrow.connect(c.funder).fundAdvance(p.offer, { ...p.terms, advanceTokenAmount: p.terms.advanceTokenAmount + 1n }, p.offerSignature, p.riskSignature, p.workerSignature)).to.be.revertedWithCustomError(c.escrow, 'InvalidSignature')
  })

  it('returns stock inventory when agreement protection is not verified in time', async () => {
    const c = await fixture(); const p = await prepare(c, 'refund')
    await c.escrow.connect(c.funder).fundAdvance(p.offer, p.terms, p.offerSignature, p.riskSignature, p.workerSignature)
    await time.increaseTo(p.offer.protectionDeadline + 1)
    await expect(c.escrow.connect(c.funder).refundAdvance(p.offerHash)).to.emit(c.escrow, 'AdvanceRefunded')
    expect(await c.stock.balanceOf(c.funder.address)).to.equal(10_000_000n)
  })
})