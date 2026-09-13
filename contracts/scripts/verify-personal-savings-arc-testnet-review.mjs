import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(new URL(relative, import.meta.url))
const text = relative => read(relative).toString('utf8')
const normalized = value => value.toString('utf8').replace(/\r\n/g, '\n')
const sha256 = value => createHash('sha256').update(value).digest('hex')

const manifest = JSON.parse(text('../audits/personal-savings-arc-testnet-v1-manifest.json'))
const source = read('../src/PersonalSavingsVault.sol')
const lock = read('../package-lock.json')
const config = text('../hardhat.config.ts')
const packageJson = JSON.parse(text('../package.json'))
const deploy = text('./deploy-savings-arc-testnet.ts')

assert.equal(manifest.status, 'internally-reviewed-testnet-candidate')
assert.equal(manifest.target.chain, 'Arc Testnet')
assert.equal(manifest.target.chainId, 5_042_002)
assert.equal(manifest.target.asset, '0x3600000000000000000000000000000000000000')
assert.equal(manifest.deployment.enabled, false)
assert.equal(manifest.reviewBoundary.externalAuditCompleted, false)
assert.equal(manifest.reviewBoundary.financialProductionReady, false)
assert.equal(sha256(normalized(source)), manifest.source.normalizedLfSha256)
assert.equal(sha256(normalized(lock)), manifest.toolchain.packageLockNormalizedLfSha256)
assert.equal(packageJson.devDependencies['@openzeppelin/contracts'], '5.0.2')
assert.match(config, /version: '0\.8\.24'/)
assert.match(config, /optimizer: \{ enabled: true, runs: 200 \}/)
assert.match(config, /viaIR: true/)
assert.match(deploy, /assertPersonalSavingsArcTestnetBuild\(\)/)
assert.match(deploy, /network\.chainId !== 5_042_002n/)
assert.match(deploy, new RegExp(manifest.target.asset, 'i'))
assert.match(deploy, /DEPLOY_REVIEWED_ARC_TEST_SAVINGS_V1/)
assert.match(deploy, /MAX_PAGE_SIZE\(\) !== 100n/)

console.log('PersonalSavingsVault Arc Testnet review package checks passed.')
