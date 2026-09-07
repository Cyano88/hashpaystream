import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { getAddress, isAddress, zeroAddress } from 'viem'

const address = n => getAddress('0x' + String(n).repeat(40))
const defaults = {
  XLAYER_MAINNET_USDC_ADDRESS: '0xB6CEceAB302E2E4948951eE7843FC24E92933061',
  ARC_TEST_USDC_ADDRESS: '0x3600000000000000000000000000000000000000',
  ARC_REPAYMENT_ROUTER_ADDRESS: address(2),
  UPFRONT_UNDERWRITING_SIGNER: address(3), UPFRONT_PROTECTION_SIGNER: address(4),
  UPFRONT_XLAYER_CONTRACT_OWNER: address(5), UPFRONT_ARC_CONTRACT_OWNER: address(5),
  UPFRONT_REPAYMENT_CREDIT_SIGNER: address(6), HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS: address(7),
  UPFRONT_OWNER_CONTROL_CONFIRM: 'CONTROLLED_MAINNET_OWNER',
  UPFRONT_MAINNET_DEPLOY_CONFIRM: 'DEPLOY_REVIEWED_V2_PAUSED_XLAYER_MAINNET',
  UPFRONT_ARC_DEPLOY_CONFIRM: 'DEPLOY_REVIEWED_V4_PAUSED_ARC_TESTNET',
}
const artifactRoot = path.resolve(process.argv[2] ?? 'contracts')
const frozen = {}
for (const name of ['UpfrontAdvanceEscrowV2', 'ArcRepaymentRouterV4']) {
  const file = path.join(artifactRoot, 'artifacts/src', name + '.sol', name + '.json')
  const artifact = JSON.parse(await readFile(file, 'utf8'))
  const debug = JSON.parse(await readFile(file.replace(/\.json$/, '.dbg.json'), 'utf8'))
  const info = JSON.parse(await readFile(path.resolve(path.dirname(file), debug.buildInfo), 'utf8'))
  frozen[name] = { artifact, info }
}
const scripts = new Map()
for (const name of ['plan-mainnet','plan-arc','deploy-mainnet','deploy-arc','verify-reviewed-deployment']) {
  const source = (await readFile('contracts/scripts/' + name + '.ts', 'utf8')).replace('main().catch(', 'globalThis.__completion = main().catch(')
  const result = await build({
    stdin: { contents: source, resolveDir: path.resolve('contracts/scripts'), sourcefile: name + '.ts', loader: 'ts' },
    bundle: true, format: 'cjs', platform: 'node', write: false, packages: 'external',
    plugins: [{ name: 'no-network-deployment-fixture', setup(b) {
      b.onResolve({ filter: /^(hardhat|node:child_process|@openzeppelin\/contracts\/package.json)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
        args.path === 'hardhat' ? 'export const ethers=globalThis.__fixture.ethers; export const config=globalThis.__fixture.config; export const artifacts=globalThis.__fixture.artifacts'
        : args.path === 'node:child_process' ? 'export const execFileSync=(...args)=>globalThis.__fixture.verifySources(...args)'
        : 'module.exports={version:globalThis.__fixture.openzeppelinVersion}'
      }))
    } }],
  })
  scripts.set(name, result.outputFiles[0].text)
}

async function run(name, override = {}) {
  const env = { ...defaults, ...override.env }
  if (name === 'deploy-arc') delete env.ARC_REPAYMENT_ROUTER_ADDRESS
  const chainId = override.chainId ?? (name.endsWith('arc') ? 5042002n : 196n)
  const arc = chainId === 5042002n
  env.POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS = address(8)
  env.UPFRONT_VERIFY_DEPLOY_TX_HASH = '0x' + 'ab'.repeat(32)
  if (name === 'verify-reviewed-deployment' && arc) env.ARC_REPAYMENT_ROUTER_ADDRESS = address(8)
  if (name !== 'verify-reviewed-deployment' && !override.existingEscrow) delete env.POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS
  const calls = { sourceChecks: 0, factories: [], plans: [], deployments: [], output: [], errors: [] }
  const config = { paths: { root: artifactRoot }, solidity: { compilers: [{ version: '0.8.24', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } }] } }
  if (override.compilerMismatch) config.solidity.compilers[0].settings.viaIR = false
  const ethers = {
    isAddress, getAddress, ZeroAddress: zeroAddress,
    Contract: function () { return { asset: async () => defaults.XLAYER_MAINNET_USDC_ADDRESS, paused: async () => false, balanceOf: async () => 0n } },
    getCreateAddress: () => override.collision ? address(7) : address(8),
    formatEther: n => String(n), getSigners: async () => [{ address: address(9) }],
    provider: {
      getNetwork: async () => ({ chainId }),
      getTransactionReceipt: async () => ({ status: 1, contractAddress: override.wrongReceipt ? address(6) : address(8), blockNumber: 999 }),
      getTransaction: async () => ({ to: null, chainId, data: override.wrongCreation ? '0x6001' : '0x6000' }),
      getCode: async () => '0x6000', getBalance: async () => 1000000000000000000n,
      getTransactionCount: async () => 0, estimateGas: async () => 100000n,
      getFeeData: async () => ({ gasPrice: 1n }),
    },
    getContractFactory: async contractName => {
      calls.factories.push(contractName)
      return { getDeployTransaction: async (...args) => { calls.plans.push(args); return { data: '0x6000' } } }
    },
    getContractAt: async () => ({
      asset: async () => arc ? env.ARC_TEST_USDC_ADDRESS : env.XLAYER_MAINNET_USDC_ADDRESS,
      owner: async () => override.wrongOwner ? address(6) : address(5),
      pendingOwner: async () => zeroAddress, paused: async () => !override.unpaused,
      creditSigner: async () => address(6), platformTreasury: async () => override.wrongTreasury ? address(6) : address(7),
      arcRepaymentRouter: async () => address(2), underwritingSigner: async () => address(3), protectionSigner: async () => address(4),
      eip712Domain: async () => ({ name: arc ? 'HashPayStream Upfront Repayment' : 'HashPayStream Upfront', version: override.wrongDomain ? '1' : arc ? '4' : '2', chainId, verifyingContract: address(8) }),
    }),
    deployContract: async (contractName, args) => {
      calls.deployments.push({ contractName, args })
      return { waitForDeployment: async () => {}, getAddress: async () => address(8), paused: async () => !override.unpaused, platformTreasury: async () => override.wrongTreasury ? address(6) : address(7), deploymentTransaction: () => ({ hash: '0x' + 'ab'.repeat(32) }) }
    },
  }
  const artifactName = arc ? 'ArcRepaymentRouterV4' : 'UpfrontAdvanceEscrowV2'
  const build = structuredClone(frozen[artifactName])
  if (override.artifactSourceMismatch) build.info.input.sources[build.artifact.sourceName].content += '// changed'
  if (override.artifactOutputMismatch) build.artifact.bytecode += '00'
  if (override.artifactDependencyMismatch) {
    const dependency = Object.keys(build.info.input.sources).find(key => key.startsWith('@openzeppelin/'))
    build.info.input.sources[dependency].content += '// changed'
  }
  const fixture = { ethers, config,
    artifacts: { readArtifact: async () => build.artifact, getBuildInfo: async () => build.info }, openzeppelinVersion: override.dependencyMismatch ? '5.1.0' : '5.0.2',
    verifySources: (_node, args) => { calls.sourceChecks++; assert.match(args[0], /verify-combined-contract-source\.mjs$/); if (override.sourceMismatch) throw new Error('Frozen sources mismatch') },
  }
  const context = vm.createContext({
    __fixture: fixture, __dirname: path.resolve('contracts/scripts'),
    require: createRequire(import.meta.url), exports: {}, module: { exports: {} },
    process: { env, execPath: process.execPath, exitCode: 0 },
    console: { log: text => calls.output.push(JSON.parse(text)), error: text => calls.errors.push(text) },
  })
  vm.runInContext(scripts.get(name), context)
  await context.__completion
  return { ...calls, exitCode: context.process.exitCode }
}

for (const name of ['plan-mainnet','plan-arc','deploy-mainnet','deploy-arc']) {
  const valid = await run(name)
  assert.equal(valid.exitCode, 0, valid.errors.join('; '))
  assert.equal(valid.sourceChecks, 1)
  assert.equal(valid.output[0].financialProductionReady, false)
  assert.equal(valid.output[0].contractName, name.endsWith('arc') ? 'ArcRepaymentRouterV4' : 'UpfrontAdvanceEscrowV2')
  if (name.startsWith('plan')) {
    assert.equal(valid.deployments.length, 0)
    assert.equal(valid.factories[0], valid.output[0].contractName)
    if (name.endsWith('arc')) assert.equal(valid.plans[0][2], address(7))
  } else {
    assert.equal(valid.deployments.length, 1)
    assert.equal(valid.deployments[0].contractName, valid.output[0].contractName)
    if (name.endsWith('arc')) assert.equal(valid.deployments[0].args[2], address(7))
  }
  for (const override of [{ compilerMismatch: true }, { dependencyMismatch: true }, { sourceMismatch: true }, { artifactSourceMismatch: true }, { artifactOutputMismatch: true }, { artifactDependencyMismatch: true }, { chainId: 1n }]) {
    const rejected = await run(name, override)
    assert.equal(rejected.exitCode, 1)
    assert.equal(rejected.deployments.length, 0)
  }
}
for (const name of ['plan-arc','deploy-arc']) {
  const missing = await run(name, { env: { HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS: '' } })
  assert.equal(missing.exitCode, 1)
  assert.equal(missing.deployments.length, 0)
}
assert.equal((await run('deploy-mainnet', { env: { UPFRONT_MAINNET_DEPLOY_CONFIRM: 'DEPLOY_PAUSED_XLAYER_MAINNET' } })).deployments.length, 0)
assert.equal((await run('deploy-arc', { env: { UPFRONT_ARC_DEPLOY_CONFIRM: '' } })).deployments.length, 0)
assert.equal((await run('deploy-mainnet', { unpaused: true })).exitCode, 1)
assert.equal((await run('deploy-arc', { unpaused: true })).exitCode, 1)
assert.equal((await run('deploy-arc', { wrongTreasury: true })).exitCode, 1)
console.log('Reviewed command selection, treasury ordering, source/compiler/dependency gates, network guards and paused-state checks passed with mocked deployment calls only.')

for (const chainId of [196n, 5042002n]) {
  const valid = await run('verify-reviewed-deployment', { chainId })
  assert.equal(valid.exitCode, 0, valid.errors.join('; '))
  assert.equal(valid.deployments.length, 0)
  assert.equal(valid.output[0].creationBytecodeAndArgumentsMatch, true)
  assert.equal(valid.output[0].financialProductionReady, false)
  for (const failure of ['wrongReceipt', 'wrongCreation', 'wrongOwner', 'wrongDomain', 'unpaused', 'artifactSourceMismatch', 'artifactOutputMismatch']) {
    const rejected = await run('verify-reviewed-deployment', { chainId, [failure]: true })
    assert.equal(rejected.exitCode, 1, failure)
    assert.equal(rejected.deployments.length, 0)
  }
}
assert.equal((await run('verify-reviewed-deployment', { chainId: 5042002n, wrongTreasury: true })).exitCode, 1)
console.log('Read-only reviewed deployment verification rejects wrong receipt, creation data, source artifact, owner, domain, treasury and unpaused state.')

const unpausedLegacy = await run('deploy-mainnet', { existingEscrow: true, env: { UPFRONT_REPLACEMENT_CONFIRM: 'REPLACE_EMPTY_PAUSED_STACK', UPFRONT_UNPAUSED_LEGACY_RETIRE_CONFIRM: 'RETIRE_EMPTY_UNPAUSED_LEGACY_MAINNET' } })
assert.equal(unpausedLegacy.exitCode, 1)
assert.equal(unpausedLegacy.deployments.length, 0)
assert.match(unpausedLegacy.errors.join('; '), /coordinated funding freeze/)
console.log('The former empty-unpaused legacy retirement bypass is rejected.')
