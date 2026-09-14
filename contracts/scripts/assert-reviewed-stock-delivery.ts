import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifacts, config, ethers } from 'hardhat'
import { assertReviewedBuild } from './assert-reviewed-build'

const CONTRACT = 'AgreementBackedStockDelivery'

type ImmutableReference = { start: number; length: number }
export type ReviewPlan = {
  schema: number
  status: string
  deploymentApproved: boolean
  externalReviewSha256?: string | null
  sourcePath: string
  sourceSha256: string
  candidateEvidenceSha256: string
  artifactSha256: string
  creationBytecodeHash: string
  runtimeBytecodeHash: string
  compiler: { version: string; optimizer: boolean; optimizerRuns: number; viaIR: boolean }
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const normalizedSource = (path: string) => readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

export function maskImmutableReferences(bytecode: string, references: Record<string, ImmutableReference[]>) {
  if (!/^0x[0-9a-f]*$/i.test(bytecode) || bytecode.length % 2 !== 0) throw new Error('Runtime bytecode is invalid.')
  const bytes = Buffer.from(bytecode.slice(2), 'hex')
  for (const locations of Object.values(references)) for (const { start, length } of locations) {
    if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length < 1 || start + length > bytes.length) throw new Error('Immutable reference is invalid.')
    bytes.fill(0, start, start + length)
  }
  return '0x' + bytes.toString('hex')
}

export async function assertReviewedStockDeliveryArtifact() {
  assertReviewedBuild()
  const root = resolve(config.paths.root, '..')
  const plan = JSON.parse(readFileSync(resolve(root, 'docs/evidence/stock-paused-deployment-plan.json'), 'utf8')) as ReviewPlan
  if (plan.schema !== 2 || typeof plan.status !== 'string' || typeof plan.deploymentApproved !== 'boolean'
    || plan.compiler.version !== '0.8.24' || !plan.compiler.optimizer || plan.compiler.optimizerRuns !== 200 || !plan.compiler.viaIR) {
    throw new Error('Stock delivery review packet is not the expected v2 packet.')
  }
  const artifact = await artifacts.readArtifact(CONTRACT)
  const artifactPath = resolve(config.paths.artifacts, artifact.sourceName, `${CONTRACT}.json`)
  if (artifact.sourceName !== plan.sourcePath.replace(/^contracts\//, '')
    || sha256(normalizedSource(resolve(root, plan.sourcePath))) !== plan.sourceSha256
    || sha256(normalizedSource(resolve(root, 'docs/evidence/stock-xlayer-candidate.json'))) !== plan.candidateEvidenceSha256
    || sha256(normalizedSource(artifactPath)) !== plan.artifactSha256
    || ethers.keccak256(artifact.bytecode) !== plan.creationBytecodeHash
    || ethers.keccak256(artifact.deployedBytecode) !== plan.runtimeBytecodeHash) {
    throw new Error('Compiled stock delivery artifact differs from the frozen review packet.')
  }
  const info = await artifacts.getBuildInfo(`${artifact.sourceName}:${CONTRACT}`)
  const output = info?.output.contracts[artifact.sourceName]?.[CONTRACT]
  if (!info || !output || info.solcVersion !== '0.8.24') throw new Error('Stock delivery build information is unavailable.')
  return { artifact, immutableReferences: output.evm.deployedBytecode.immutableReferences as Record<string, ImmutableReference[]>, plan }
}

export function assertRuntimeMatchesReviewedArtifact(actual: string, expected: string, references: Record<string, ImmutableReference[]>) {
  if (maskImmutableReferences(actual, references) !== maskImmutableReferences(expected, references)) {
    throw new Error('Deployed stock delivery runtime differs from the reviewed artifact.')
  }
}
export function assertApprovedPausedDeployment(plan: ReviewPlan) {
  if (plan.status !== 'APPROVED_PAUSED_DEPLOYMENT' || plan.deploymentApproved !== true
    || !/^[a-f0-9]{64}$/.test(String(plan.externalReviewSha256 ?? ''))) {
    throw new Error('Stock delivery has no hash-pinned approved external review for paused deployment.')
  }
}