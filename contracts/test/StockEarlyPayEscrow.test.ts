import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { StockEarlyPayEscrow, MockUSDC, ReentrantUSDC } from '../typechain-types'

const U = 1_000_000n
const offerTypes = { StockOffer: [
  { name: 'earningsId', type: 'bytes32' }, { name: 'funder', type: 'address' },
  { name: 'asset', type: 'address' }, { name: 'tokenAmount', type: 'uint256' },
  { name: 'principal', type: 'uint256' }, { name: 'feeBps', type: 'uint16' },
  { name: 'payAt', type: 'uint48' }, { name: 'expiresAt', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] }
const riskTypes = { RiskApproval: [
  { name: 'offerHash', type: 'bytes32' }, { name: 'observedAt', type: 'uint48' },
  { name: 'validUntil', type: 'uint48' }, { name: 'policyVersion', type: 'uint256' },
] }

describe('StockEarlyPayEscrow (local candidate)', () => {
  async function fixture(stockName = 'MockUSDC', usdcName = 'MockUSDC') {
    const [admin, employer, worker, funder, riskSigner, outsider] = await ethers.getSigners()
    const usdc = await ethers.deployContract(usdcName) as unknown as MockUSDC
    const stock = await ethers.deployContract(stockName) as unknown as MockUSDC
    // Illustrative test policy only. No production ceiling or asset is selected.
    const escrow = await ethers.deployContract('StockEarlyPayEscrow', [usdc.target, admin.address, riskSigner.address, 300, 120]) as unknown as StockEarlyPayEscrow
    await escrow.setAssetAllowed(stock.target, true)
    await escrow.setFunderAllowed(funder.address, true)
    await escrow.setPaused(false)
    await stock.mint(funder.address, 1_000n * U)
    await stock.connect(funder).approve(escrow.target, ethers.MaxUint256)
    await escrow.connect(funder).depositStock(stock.target, 1_000n * U)
    await usdc.mint(employer.address, 500n * U)
    await usdc.connect(employer).approve(escrow.target, ethers.MaxUint256)
    const salt = ethers.id('earnings-1'), payAt = (await time.latest()) + 86400
    const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], [employer.address, salt]))
    await escrow.connect(employer).fundEarnings(salt, worker.address, 500n * U, payAt)
    const domain = { name: 'HashPayStream Stock Early Pay', version: '1', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await escrow.getAddress() }
    return { admin, employer, worker, funder, riskSigner, outsider, usdc, stock, escrow, id, payAt, domain }
  }
  async function signed(c: Awaited<ReturnType<typeof fixture>>, changes: Record<string, unknown> = {}) {
    const now = await time.latest()
    const offer = { earningsId: c.id, funder: c.funder.address, asset: await c.stock.getAddress(), tokenAmount: 2n * U, principal: 100n * U, feeBps: 100, payAt: c.payAt, expiresAt: now + 60, nonce: ethers.id('offer-1'), ...changes }
    const hash = await c.escrow.offerHash(offer as any)
    const risk = { offerHash: hash, observedAt: now, validUntil: now + 60, policyVersion: await c.escrow.policyVersion() }
    const funderSignature = await c.funder.signTypedData(c.domain, offerTypes, offer)
    const riskSignature = await c.riskSigner.signTypedData(c.domain, riskTypes, risk)
    return { offer, hash, risk, funderSignature, riskSignature }
  }
  async function accept(c: Awaited<ReturnType<typeof fixture>>, quote: Awaited<ReturnType<typeof signed>>) {
    return c.escrow.connect(c.worker).acceptOffer(quote.offer as any, quote.funderSignature, quote.risk, quote.riskSignature)
  }
  it('delivers stocks and reserves principal plus fee; pays both parties exactly once', async () => {
    const c = await fixture()
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    await expect(accept(c, q)).to.emit(c.escrow, 'StockDelivered')
    expect(await c.stock.balanceOf(c.worker.address)).to.equal(2n * U)
    expect((await c.escrow.earnings(c.id)).available).to.equal(399n * U)
    expect((await c.escrow.claims(q.hash)).repayment).to.equal(101n * U)
    expect(await c.escrow.totalUsdcLiability()).to.equal(500n * U)
    await expect(c.escrow.settle(q.hash)).to.be.revertedWithCustomError(c.escrow, 'NotDue')
    await time.increaseTo(c.payAt)
    await c.escrow.connect(c.outsider).releaseEarnings(c.id)
    await c.escrow.connect(c.outsider).settle(q.hash)
    expect(await c.usdc.balanceOf(c.worker.address)).to.equal(399n * U)
    expect(await c.usdc.balanceOf(c.funder.address)).to.equal(101n * U)
    expect(await c.escrow.totalUsdcLiability()).to.equal(0)
    await expect(c.escrow.settle(q.hash)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
    await expect(c.escrow.releaseEarnings(c.id)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
  })
  it('does not accept unapproved earnings or permit employer cancellation after approval', async () => {
    const c = await fixture(), q = await signed(c)
    await expect(accept(c, q)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    await expect(c.escrow.connect(c.employer).cancelUnapprovedEarnings(c.id)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
    await accept(c, q)
    await expect(c.escrow.connect(c.employer).cancelUnapprovedEarnings(c.id)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
  })
  it('allows cancellation of unapproved earnings and never allows resurrection', async () => {
    const c = await fixture()
    await c.escrow.setPaused(true)
    await c.escrow.connect(c.employer).cancelUnapprovedEarnings(c.id)
    expect(await c.usdc.balanceOf(c.employer.address)).to.equal(500n * U)
    expect(await c.escrow.totalUsdcLiability()).to.equal(0)
    await c.escrow.setPaused(false)
    await expect(c.escrow.connect(c.employer).approveEarnings(c.id)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
  })
  it('rejects foreign worker acceptance, foreign employer approval and self-funding', async () => {
    const c = await fixture()
    await expect(c.escrow.connect(c.outsider).approveEarnings(c.id)).to.be.revertedWithCustomError(c.escrow, 'Unauthorized')
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    await expect(c.escrow.connect(c.outsider).acceptOffer(q.offer as any, q.funderSignature, q.risk, q.riskSignature)).to.be.revertedWithCustomError(c.escrow, 'Unauthorized')
    await c.escrow.setFunderAllowed(c.worker.address, true)
    await expect(accept(c, await signed(c, { funder: c.worker.address }))).to.be.revertedWithCustomError(c.escrow, 'InvalidInput')
    await c.escrow.setFunderAllowed(c.employer.address, true)
    await expect(accept(c, await signed(c, { funder: c.employer.address }))).to.be.revertedWithCustomError(c.escrow, 'InvalidInput')
  })
  it('enforces percentage ceiling, exact integer rounding and fully funded fees', async () => {
    const c = await fixture()
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    expect(await c.escrow.feeFor(1, 1)).to.equal(0)
    expect(await c.escrow.feeFor(100n * U, 0)).to.equal(0)
    await expect(accept(c, await signed(c, { feeBps: 301 }))).to.be.revertedWithCustomError(c.escrow, 'InvalidInput')
    await expect(accept(c, await signed(c, { principal: 500n * U }))).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
  })
  it('rejects replay and prevents two offers spending the same earnings', async () => {
    const c = await fixture()
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c, { principal: 300n * U })
    await accept(c, q)
    await expect(accept(c, q)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
    await expect(accept(c, await signed(c, { principal: 300n * U, nonce: ethers.id('second') }))).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
  })
  it('checks inventory again at acceptance and supports funder cancellation', async () => {
    const c = await fixture()
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    await c.escrow.connect(c.funder).withdrawStock(c.stock.target, 1_000n * U)
    await expect(accept(c, q)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
    await c.escrow.connect(c.funder).depositStock(c.stock.target, 1_000n * U)
    await c.escrow.connect(c.funder).cancelOffer(q.offer as any)
    await expect(accept(c, q)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
  })
  it('rejects expired quotes, stale risk evidence and policy invalidation', async () => {
    const c = await fixture()
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    await c.escrow.invalidateRiskApprovals()
    await expect(accept(c, q)).to.be.revertedWithCustomError(c.escrow, 'StaleRiskApproval')
    const fresh = await signed(c)
    await time.increase(61)
    await expect(accept(c, fresh)).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
    const current = await signed(c), oldRisk = { ...current.risk, observedAt: (await time.latest()) - 121 }
    const sig = await c.riskSigner.signTypedData(c.domain, riskTypes, oldRisk)
    await expect(accept(c, { ...current, risk: oldRisk, riskSignature: sig })).to.be.revertedWithCustomError(c.escrow, 'StaleRiskApproval')
  })
  it('binds exact quantity, recipient earnings, fee, chain and risk approval to signatures', async () => {
    const c = await fixture()
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    const forged = await signed(c, { tokenAmount: 3n * U })
    await expect(accept(c, { ...forged, funderSignature: q.funderSignature })).to.be.revertedWithCustomError(c.escrow, 'InvalidSignature')
    const wrongChain = await c.funder.signTypedData({ ...c.domain, chainId: 1 }, offerTypes, q.offer)
    await expect(accept(c, { ...q, funderSignature: wrongChain })).to.be.revertedWithCustomError(c.escrow, 'InvalidSignature')
    const wrongSigner = await c.outsider.signTypedData(c.domain, riskTypes, q.risk)
    await expect(accept(c, { ...q, riskSignature: wrongSigner })).to.be.revertedWithCustomError(c.escrow, 'InvalidSignature')
    await expect(accept(c, { ...q, risk: forged.risk })).to.be.revertedWithCustomError(c.escrow, 'StaleRiskApproval')
  })
  it('preserves repayment and withdrawals through pauses, delisting and funder restriction', async () => {
    const c = await fixture()
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    await accept(c, q)
    await c.escrow.setPaused(true)
    await c.escrow.setAssetAllowed(c.stock.target, false)
    await c.escrow.setFunderAllowed(c.funder.address, false)
    await c.escrow.connect(c.funder).withdrawStock(c.stock.target, 998n * U)
    await expect(accept(c, await signed(c, { nonce: ethers.id('new') }))).to.be.revertedWithCustomError(c.escrow, 'Unavailable')
    await time.increaseTo(c.payAt)
    await c.escrow.connect(c.outsider).settle(q.hash)
    await c.escrow.connect(c.outsider).releaseEarnings(c.id)
    expect(await c.usdc.balanceOf(c.funder.address)).to.equal(101n * U)
  })
  it('rejects short deposits without crediting inventory', async () => {
    const c = await fixture()
    const short = await ethers.deployContract('ShortTransferUSDC')
    await c.escrow.setAssetAllowed(short.target, true)
    await short.mint(c.funder.address, 100n * U)
    await short.connect(c.funder).approve(c.escrow.target, ethers.MaxUint256)
    await expect(c.escrow.connect(c.funder).depositStock(short.target, 10n * U)).to.be.revertedWithCustomError(c.escrow, 'TransferMismatch')
    expect(await c.escrow.inventory(c.funder.address, short.target)).to.equal(0)
  })

  it('rolls back token delivery and repayment reservation when stock delivery is short', async () => {
    const c = await fixture('StockTransferTestToken')
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    const token = await ethers.getContractAt('StockTransferTestToken', c.stock.target)
    await token.setShortTransfer(true)
    await expect(accept(c,q)).to.be.revertedWithCustomError(c.escrow,'TransferMismatch')
    expect((await c.escrow.earnings(c.id)).available).to.equal(500n * U)
    expect(await c.escrow.usedOffers(q.hash)).to.equal(false)
    expect(await c.stock.balanceOf(c.worker.address)).to.equal(0)
    expect(await c.escrow.inventory(c.funder.address,c.stock.target)).to.equal(1_000n * U)
  })

  it('keeps the claim payable after a failed USDC transfer', async () => {
    const c = await fixture('MockUSDC','PolicyUSDC')
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    await accept(c,q)
    const token = await ethers.getContractAt('PolicyUSDC', c.usdc.target)
    await token.setBlocked(c.funder.address,true)
    await time.increaseTo(c.payAt)
    await expect(c.escrow.settle(q.hash)).to.be.revertedWithCustomError(token,'IssuerRestricted')
    expect((await c.escrow.claims(q.hash)).settled).to.equal(false)
    expect(await c.escrow.totalUsdcLiability()).to.equal(500n * U)
    await token.setBlocked(c.funder.address,false)
    await c.escrow.settle(q.hash)
    expect(await c.usdc.balanceOf(c.funder.address)).to.equal(101n * U)
  })
  it('blocks token reentrancy without losing reserved USDC', async () => {
    const c = await fixture('StockTransferTestToken')
    await c.escrow.connect(c.employer).approveEarnings(c.id)
    const q = await signed(c)
    const token = c.stock as unknown as ReentrantUSDC
    await token.armCallback(c.escrow.target, c.escrow.interface.encodeFunctionData('releaseEarnings', [c.id]))
    await accept(c, q)
    expect(await token.callbackBlocked()).to.equal(true)
    expect((await c.escrow.claims(q.hash)).repayment).to.equal(101n * U)
  })
})
