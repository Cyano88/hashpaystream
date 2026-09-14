import { expect } from 'chai'
import { ethers } from 'hardhat'
import { assertApprovedPausedDeployment, assertReviewedStockDeliveryArtifact, assertRuntimeMatchesReviewedArtifact, maskImmutableReferences } from '../scripts/assert-reviewed-stock-delivery'

describe('Stock delivery deployment guards', function () {
  it('matches the frozen source, compiler and artifact packet', async function () {
    const reviewed = await assertReviewedStockDeliveryArtifact()
    expect(reviewed.plan.status).to.equal('DRAFT_BLOCKED')
  })

  it('matches a locally deployed runtime after applying the constructor immutable', async function () {
    const reviewed = await assertReviewedStockDeliveryArtifact()
    const signers = await ethers.getSigners()
    const delivery = await ethers.deployContract('AgreementBackedStockDelivery', await Promise.all(signers.slice(0, 5).map(signer => signer.getAddress())))
    await delivery.waitForDeployment()
    const runtime = await ethers.provider.getCode(await delivery.getAddress())
    expect(() => assertRuntimeMatchesReviewedArtifact(runtime, reviewed.artifact.deployedBytecode, reviewed.immutableReferences)).not.to.throw()
  })
  it('requires a hash-pinned approved external review', function () {
    const blocked = { status: 'DRAFT_BLOCKED', deploymentApproved: false, externalReviewSha256: null }
    expect(() => assertApprovedPausedDeployment(blocked as any)).to.throw('no hash-pinned approved external review')
    expect(() => assertApprovedPausedDeployment({ ...blocked, status: 'APPROVED_PAUSED_DEPLOYMENT', deploymentApproved: true, externalReviewSha256: 'ab'.repeat(32) } as any)).not.to.throw()
  })
  it('masks only declared immutable runtime ranges', function () {
    expect(maskImmutableReferences('0x112233445566', { '1': [{ start: 1, length: 2 }] })).to.equal('0x110000445566')
    expect(() => maskImmutableReferences('0x1122', { '1': [{ start: 1, length: 2 }] })).to.throw('Immutable reference is invalid')
    expect(() => maskImmutableReferences('invalid', {})).to.throw('Runtime bytecode is invalid')
  })

  it('rejects runtime changes outside immutable slots', function () {
    const refs = { '1': [{ start: 1, length: 1 }] }
    expect(() => assertRuntimeMatchesReviewedArtifact('0x11aa3344', '0x11bb3344', refs)).not.to.throw()
    expect(() => assertRuntimeMatchesReviewedArtifact('0x11aa9944', '0x11bb3344', refs)).to.throw('runtime differs')
  })
})