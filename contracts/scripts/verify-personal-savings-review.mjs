import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(new URL(relative, import.meta.url))
const text = relative => read(relative).toString('utf8')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const normalized = value => value.toString('utf8').replace(/\r\n/g, '\n')

const manifest = JSON.parse(text('../audits/personal-savings-v1-manifest.json'))
const source = read('../src/PersonalSavingsVault.sol')
const sourceText = source.toString('utf8')
const lock = read('../package-lock.json')
const config = text('../hardhat.config.ts')
const packageJson = JSON.parse(text('../package.json'))
const deploy = text('./deploy-savings-mainnet.ts')
const exampleEnv = text('../../.env.example')

assert.equal(manifest.status, 'undeployed')
assert.equal(manifest.deployment.enabled, false)
assert.equal(manifest.deployment.address, null)
assert.equal(manifest.deployment.transactionHash, null)
assert.equal(sha256(normalized(source)), manifest.source.normalizedLfSha256)
assert.equal(sha256(normalized(lock)), manifest.toolchain.packageLockNormalizedLfSha256)
assert.equal(packageJson.devDependencies['@openzeppelin/contracts'], '5.0.2')
assert.match(config, /version: '0\.8\.24'/)
assert.match(config, /optimizer: \{ enabled: true, runs: 200 \}/)
assert.match(config, /viaIR: true/)
assert.match(sourceText, /address\(asset_\)\.code\.length == 0/)
assert.match(sourceText, /EmergencyExitAlreadyRequested/)
assert.match(sourceText, /function planIdsPage/)
assert.doesNotMatch(sourceText, /function planIds\(/)
assert.match(deploy, /network\.chainId !== 196n/)
assert.match(deploy, new RegExp(manifest.target.asset, 'i'))
assert.match(deploy, /DEPLOY_NONCUSTODIAL_USDC_SAVINGS_V3/)
assert.match(deploy, /MAX_PAGE_SIZE\(\) !== 100n/)
assert.match(exampleEnv, /^VITE_HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS=\s*$/m)

console.log('PersonalSavingsVault v1 review package checks passed.')
