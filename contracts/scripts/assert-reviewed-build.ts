import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { artifacts, config } from 'hardhat'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Do not permit a deploy/plan command to silently drift from the frozen review.
export function assertReviewedBuild() {
  const compiler = config.solidity.compilers
  if (compiler.length !== 1 || compiler[0].version !== '0.8.24'
    || compiler[0].settings.optimizer?.enabled !== true
    || compiler[0].settings.optimizer?.runs !== 200
    || compiler[0].settings.viaIR !== true) throw new Error('Reviewed Solidity compiler settings do not match.')
  if (require('@openzeppelin/contracts/package.json').version !== '5.0.2') throw new Error('Reviewed OpenZeppelin version does not match.')
  const root = resolve(__dirname, '../..')
  execFileSync(process.execPath, [resolve(root, 'scripts/verify-combined-contract-source.mjs')], { cwd: root, stdio: 'pipe' })
}

export async function assertReviewedArtifact(name: string) {
  const artifact = await artifacts.readArtifact(name)
  const info = await artifacts.getBuildInfo(artifact.sourceName + ':' + name)
  if (!info || info.solcVersion !== '0.8.24' || info.input.settings.optimizer?.enabled !== true
    || info.input.settings.optimizer?.runs !== 200 || info.input.settings.viaIR !== true) throw new Error('Compiled artifact settings do not match the reviewed build.')
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../audits/combined-20260906/IMPORTED_FILES.json'), 'utf8'))
  const source = manifest.files.find((file: { path: string }) => file.path === artifact.sourceName)
  if (!source) throw new Error('Artifact source is not in the combined reviewed package.')
  for (const file of manifest.files) {
    const input = info.input.sources[file.path]
    if (!input && file.path !== artifact.sourceName) continue
    if (!input) throw new Error('Artifact build input is missing the reviewed contract source.')
    const hash = createHash('sha256').update(input.content.replace(/\r\n/g, '\n')).digest('hex')
    if (hash !== file.normalizedSha256) throw new Error('Artifact was compiled from different reviewed sources.')
  }
  const reviewedPaths = new Set(manifest.files.map((file: { path: string }) => file.path))
  for (const [sourceName, input] of Object.entries(info.input.sources)) {
    if (reviewedPaths.has(sourceName)) continue
    if (!sourceName.startsWith('@openzeppelin/contracts/') || sourceName.split('/').includes('..')) throw new Error('Artifact includes an unreviewed source dependency.')
    const installed = readFileSync(resolve(config.paths.root, 'node_modules', sourceName), 'utf8')
    if (installed.replace(/\r\n/g, '\n') !== input.content.replace(/\r\n/g, '\n')) throw new Error('Artifact dependency differs from the pinned installed package.')
  }
  const output = info.output.contracts[artifact.sourceName]?.[name]
  if (!output || ('0x' + output.evm.bytecode.object).toLowerCase() !== artifact.bytecode.toLowerCase()
    || JSON.stringify(output.abi) !== JSON.stringify(artifact.abi)) throw new Error('Artifact differs from its compiler output.')
  return artifact
}
