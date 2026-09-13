import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { artifacts, config } from 'hardhat'

type ReviewManifest = {
  source: { path: string; normalizedLfSha256: string }
  toolchain: { packageLockNormalizedLfSha256: string }
  target: { chainId: number; asset: string }
  reviewBoundary: { externalAuditCompleted: boolean; financialProductionReady: boolean }
}

const normalized = (value: string | Buffer) => value.toString().replace(/\r\n/g, '\n')
const sha256 = (value: string | Buffer) => createHash('sha256').update(normalized(value)).digest('hex')

export async function assertPersonalSavingsArcTestnetBuild() {
  const compiler = config.solidity.compilers
  if (compiler.length !== 1 || compiler[0].version !== '0.8.24'
    || compiler[0].settings.optimizer?.enabled !== true
    || compiler[0].settings.optimizer?.runs !== 200
    || compiler[0].settings.viaIR !== true) throw new Error('Savings review compiler settings do not match.')
  if (require('@openzeppelin/contracts/package.json').version !== '5.0.2') throw new Error('Savings review OpenZeppelin version does not match.')

  const root = resolve(__dirname, '..')
  const manifest = JSON.parse(readFileSync(resolve(root, 'audits/personal-savings-arc-testnet-v1-manifest.json'), 'utf8')) as ReviewManifest
  if (manifest.target.chainId !== 5_042_002 || manifest.target.asset.toLowerCase() !== '0x3600000000000000000000000000000000000000'
    || manifest.reviewBoundary.externalAuditCompleted || manifest.reviewBoundary.financialProductionReady) {
    throw new Error('Arc Testnet savings review boundary does not match.')
  }
  if (sha256(readFileSync(resolve(root, manifest.source.path))) !== manifest.source.normalizedLfSha256
    || sha256(readFileSync(resolve(root, 'package-lock.json'))) !== manifest.toolchain.packageLockNormalizedLfSha256) {
    throw new Error('Savings reviewed source or dependency lock has changed.')
  }

  const artifact = await artifacts.readArtifact('PersonalSavingsVault')
  const info = await artifacts.getBuildInfo(artifact.sourceName + ':PersonalSavingsVault')
  if (!info || info.solcVersion !== '0.8.24' || info.input.settings.optimizer?.enabled !== true
    || info.input.settings.optimizer?.runs !== 200 || info.input.settings.viaIR !== true) {
    throw new Error('Savings artifact compiler settings do not match.')
  }
  const sourceInput = info.input.sources[artifact.sourceName]
  if (!sourceInput || sha256(sourceInput.content) !== manifest.source.normalizedLfSha256) {
    throw new Error('Savings artifact was compiled from different source.')
  }

  const visited = new Set<string>()
  const pending = [artifact.sourceName]
  while (pending.length) {
    const sourceName = pending.pop()!
    if (visited.has(sourceName)) continue
    visited.add(sourceName)
    const input = info.input.sources[sourceName]
    if (!input) throw new Error('Savings artifact import is missing from compiler input.')
    if (sourceName.startsWith('@openzeppelin/contracts/')) {
      if (normalized(readFileSync(resolve(root, 'node_modules', sourceName))) !== normalized(input.content)) {
        throw new Error('Savings artifact dependency differs from OpenZeppelin 5.0.2.')
      }
    } else if (sourceName !== artifact.sourceName) {
      throw new Error('Savings artifact imports an unreviewed local source.')
    }
    for (const match of input.content.matchAll(/import\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]\s*;/g)) {
      const request = match[1]
      const imported = request.startsWith('.') ? posix.normalize(posix.join(posix.dirname(sourceName), request)) : request
      if (!imported.startsWith('@openzeppelin/contracts/')) throw new Error('Savings artifact has an unreviewed import.')
      pending.push(imported)
    }
  }

  const output = info.output.contracts[artifact.sourceName]?.PersonalSavingsVault
  if (!output || ('0x' + output.evm.bytecode.object).toLowerCase() !== artifact.bytecode.toLowerCase()
    || JSON.stringify(output.abi) !== JSON.stringify(artifact.abi)) throw new Error('Savings artifact differs from compiler output.')
  return artifact
}
