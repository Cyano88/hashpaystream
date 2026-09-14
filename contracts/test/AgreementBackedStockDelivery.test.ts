import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'

const offerTypes = { UnderwritingOffer: [
  { name: 'worker', type: 'address' }, { name: 'agreementTermsHash', type: 'bytes32' },
  { name: 'intelligenceCommitment', type: 'bytes32' }, { name: 'protectedAmount', type: 'uint256' },
  { name: 'maxAdvanceBps', type: 'uint16' }, { name: 'protectionDeadline', type: 'uint48' },
  { name: 'underwritingDeadline', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] }
const deliveryTypes = { DeliveryTerms: [
  { name: 'offerHash', type: 'bytes32' }, { name: 'funder', type: 'address' },
  { name: 'repaymentRecipient', type: 'address' }, { name: 'workerArcRecipient', type: 'address' },
  { name: 'platformTreasury', type: 'address' }, { name: 'stockAsset', type: 'address' },
  { name: 'stockTokenAmount', type: 'uint256' }, { name: 'advanceUsdcAmount', type: 'uint256' },
  { name: 'funderRepaymentAmount', type: 'uint256' }, { name: 'platformFeeAmount', type: 'uint256' },
  { name: 'marketObservedAt', type: 'uint48' }, { name: 'deadline', type: 'uint48' },
  { name: 'nonce', type: 'bytes32' },
] }
const protectionTypes = { ProtectionAttestation: [
  { name: 'deliveryId', type: 'bytes32' }, { name: 'arcAgreementHash', type: 'bytes32' },
  { name: 'arcTermsHash', type: 'bytes32' }, { name: 'agreementTermsHash', type: 'bytes32' },
  { name: 'deliveryTermsHash', type: 'bytes32' }, { name: 'arcRecipient', type: 'address' },
  { name: 'funder', type: 'address' }, { name: 'repaymentRecipient', type: 'address' },
  { name: 'worker', type: 'address' }, { name: 'protectedAmount', type: 'uint256' },
  { name: 'advanceUsdcAmount', type: 'uint256' }, { name: 'observedAt', type: 'uint48' },
  { name: 'deadline', type: 'uint48' },
] }

describe('AgreementBackedStockDelivery', () => {
  async function fixture(tokenName = 'MockUSDC') {
    const [owner, underwriter, riskSigner, protectionSigner, funder, worker, workerArcRecipient, treasury, router] = await ethers.getSigners()
    const stock = await ethers.deployContract(tokenName)
    const delivery = await ethers.deployContract('AgreementBackedStockDelivery', [router.address, underwriter.address, riskSigner.address, protectionSigner.address, owner.address])
    await delivery.connect(owner).setFunderAllowed(funder.address, true)
    await delivery.connect(owner).setStockAssetAllowed(stock.target, true)
    await delivery.connect(owner).setPaused(false)
    await stock.mint(funder.address, 10_000_000n)
    await stock.connect(funder).approve(delivery.target, ethers.MaxUint256)
    const domain = { name: 'HashPayStream Stock Delivery', version: '1', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: delivery.target }
    return { owner, underwriter, riskSigner, protectionSigner, funder, worker, workerArcRecipient, treasury, router, stock, delivery, domain }
  }

  async function prepare(c: Awaited<ReturnType<typeof fixture>>, seed = 'one') {
    const now = await time.latest()
    const offer = { worker: c.worker.address, agreementTermsHash: ethers.id('job-terms'), intelligenceCommitment: ethers.id('independent-price-liquidity-and-participant-evidence'), protectedAmount: 100_000_000n, maxAdvanceBps: 3000, protectionDeadline: now + 3600, underwritingDeadline: now + 600, nonce: ethers.id(seed) }
    const offerSignature = await c.underwriter.signTypedData(c.domain, offerTypes, offer)
    const offerHash = await c.delivery.hashUnderwritingOffer(offer)
    const terms = { offerHash, funder: c.funder.address, repaymentRecipient: c.funder.address, workerArcRecipient: c.workerArcRecipient.address, platformTreasury: c.treasury.address, stockAsset: c.stock.target, stockTokenAmount: 250_000n, advanceUsdcAmount: 25_000_000n, funderRepaymentAmount: 25_200_000n, platformFeeAmount: 800_000n, marketObservedAt: now, deadline: offer.underwritingDeadline, nonce: ethers.id(`delivery-${seed}`) }
    const deliveryTermsHash = await c.delivery.hashDeliveryTerms(terms)
    const attestation = { deliveryId: deliveryTermsHash, arcAgreementHash: ethers.id(`arc-agreement-${seed}`), arcTermsHash: ethers.id('arc-terms'), agreementTermsHash: offer.agreementTermsHash, deliveryTermsHash, arcRecipient: c.router.address, funder: c.funder.address, repaymentRecipient: c.funder.address, worker: c.worker.address, protectedAmount: offer.protectedAmount, advanceUsdcAmount: terms.advanceUsdcAmount, observedAt: now, deadline: now + 300 }
    return {
      offer, terms, attestation, deliveryTermsHash, offerSignature,
      riskSignature: await c.riskSigner.signTypedData(c.domain, deliveryTypes, terms),
      workerSignature: await c.worker.signTypedData(c.domain, deliveryTypes, terms),
      protectionSignature: await c.protectionSigner.signTypedData(c.domain, protectionTypes, attestation),
    }
  }

  it('delivers stock directly from funder to worker and never holds inventory', async () => {
    const c = await fixture(); const p = await prepare(c)
    await expect(c.delivery.connect(c.funder).deliver(p.offer, p.terms, p.attestation, p.offerSignature, p.riskSignature, p.workerSignature, p.protectionSignature)).to.emit(c.delivery, 'StockDelivered')
    expect(await c.stock.balanceOf(c.delivery.target)).to.equal(0)
    expect(await c.stock.balanceOf(c.worker.address)).to.equal(p.terms.stockTokenAmount)
    expect(await c.stock.balanceOf(c.funder.address)).to.equal(10_000_000n - p.terms.stockTokenAmount)
    const record = await c.delivery.deliveries(p.deliveryTermsHash)
    expect(record.arcAgreementHash).to.equal(p.attestation.arcAgreementHash)
    expect(record.worker).to.equal(c.worker.address)
  })

  it('rejects paused, unapproved funder, and unapproved stock paths', async () => {
    const c = await fixture(); const p = await prepare(c)
    await c.delivery.connect(c.owner).setPaused(true)
    await expect(c.delivery.connect(c.funder).deliver(p.offer, p.terms, p.attestation, p.offerSignature, p.riskSignature, p.workerSignature, p.protectionSignature)).to.be.revertedWithCustomError(c.delivery, 'EnforcedPause')
    await c.delivery.connect(c.owner).setPaused(false)
    await c.delivery.connect(c.owner).setFunderAllowed(c.funder.address, false)
    await expect(c.delivery.connect(c.funder).deliver(p.offer, p.terms, p.attestation, p.offerSignature, p.riskSignature, p.workerSignature, p.protectionSignature)).to.be.revertedWithCustomError(c.delivery, 'FunderNotAllowed')
    await c.delivery.connect(c.owner).setFunderAllowed(c.funder.address, true)
    await c.delivery.connect(c.owner).setStockAssetAllowed(c.stock.target, false)
    await expect(c.delivery.connect(c.funder).deliver(p.offer, p.terms, p.attestation, p.offerSignature, p.riskSignature, p.workerSignature, p.protectionSignature)).to.be.revertedWithCustomError(c.delivery, 'StockAssetNotAllowed')
  })

  it('requires independently controlled authorization roles', async () => {
    const [owner, signer, other, router] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('AgreementBackedStockDelivery')
    await expect(factory.deploy(router.address, signer.address, signer.address, other.address, owner.address)).to.be.revertedWithCustomError(factory, 'InvalidAddress')
    const c = await fixture()
    await expect(c.delivery.connect(c.owner).setRiskSigner(c.underwriter.address)).to.be.revertedWithCustomError(c.delivery, 'InvalidAddress')
    await expect(c.delivery.connect(c.owner).setProtectionSigner(c.riskSigner.address)).to.be.revertedWithCustomError(c.delivery, 'InvalidAddress')
  })

  it('rolls back short token delivery and blocks token reentrancy', async () => {
    const short = await fixture('ShortTransferUSDC'); const shortTerms = await prepare(short, 'short')
    await expect(short.delivery.connect(short.funder).deliver(shortTerms.offer, shortTerms.terms, shortTerms.attestation, shortTerms.offerSignature, shortTerms.riskSignature, shortTerms.workerSignature, shortTerms.protectionSignature)).to.be.revertedWithCustomError(short.delivery, 'UnsupportedTransferFee')
    expect(await short.stock.balanceOf(short.worker.address)).to.equal(0)
    expect((await short.delivery.deliveries(shortTerms.deliveryTermsHash)).deliveredAt).to.equal(0)

    const reentrant = await fixture('ReentrantUSDC'); const p = await prepare(reentrant, 'reentrant')
    const callback = reentrant.delivery.interface.encodeFunctionData('deliver', [p.offer, p.terms, p.attestation, p.offerSignature, p.riskSignature, p.workerSignature, p.protectionSignature])
    await reentrant.stock.armCallback(reentrant.delivery.target, callback)
    await reentrant.delivery.connect(reentrant.funder).deliver(p.offer, p.terms, p.attestation, p.offerSignature, p.riskSignature, p.workerSignature, p.protectionSignature)
    expect(await reentrant.stock.callbackBlocked()).to.equal(true)
    expect(await reentrant.stock.balanceOf(reentrant.worker.address)).to.equal(p.terms.stockTokenAmount)
  })

  it('rejects tampering, excess fees, stale prices, and Arc replay', async () => {
    const c = await fixture(); const p = await prepare(c)
    await expect(c.delivery.connect(c.funder).deliver(p.offer, { ...p.terms, stockTokenAmount: p.terms.stockTokenAmount + 1n }, p.attestation, p.offerSignature, p.riskSignature, p.workerSignature, p.protectionSignature)).to.be.revertedWithCustomError(c.delivery, 'InvalidSignature')
    const expensive = await prepare(c, 'expensive')
    await expect(c.delivery.connect(c.funder).deliver(expensive.offer, { ...expensive.terms, funderRepaymentAmount: expensive.terms.advanceUsdcAmount * 104n / 100n }, expensive.attestation, expensive.offerSignature, expensive.riskSignature, expensive.workerSignature, expensive.protectionSignature)).to.be.revertedWithCustomError(c.delivery, 'InvalidAmount')
    const stale = await prepare(c, 'stale')
    await time.increase(301)
    await expect(c.delivery.connect(c.funder).deliver(stale.offer, stale.terms, stale.attestation, stale.offerSignature, stale.riskSignature, stale.workerSignature, stale.protectionSignature)).to.be.revertedWithCustomError(c.delivery, 'InvalidDeadline')
    const first = await prepare(c, 'first')
    await c.delivery.connect(c.funder).deliver(first.offer, first.terms, first.attestation, first.offerSignature, first.riskSignature, first.workerSignature, first.protectionSignature)
    const second = await prepare(c, 'second')
    const replayAttestation = { ...second.attestation, arcAgreementHash: first.attestation.arcAgreementHash }
    const replaySignature = await c.protectionSigner.signTypedData(c.domain, protectionTypes, replayAttestation)
    await expect(c.delivery.connect(c.funder).deliver(second.offer, second.terms, replayAttestation, second.offerSignature, second.riskSignature, second.workerSignature, replaySignature)).to.be.revertedWithCustomError(c.delivery, 'ArcAgreementAlreadyUsed')
  })
})