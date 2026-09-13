import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createPublicClient, encodeDeployData, getAddress, getContractAddress, http, parseAbi } from 'viem'

// Read-only: no private keys, wallet client, signing or broadcasting.
const root = process.cwd()
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''))
const digest = file => createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex')
const manifest = read('contracts/audits/personal-savings-v1-manifest.json')
assert.equal(digest('contracts/' + manifest.source.path), manifest.source.normalizedLfSha256)
assert.equal(digest('contracts/package-lock.json'), manifest.toolchain.packageLockNormalizedLfSha256)
const artifactPath = 'contracts/artifacts/src/PersonalSavingsVault.sol/PersonalSavingsVault.json'
const artifact = read(artifactPath)
const debug = read(artifactPath.replace('.json', '.dbg.json'))
const build = read(path.normalize(path.join(path.dirname(artifactPath), debug.buildInfo)))
assert.equal(build.solcVersion, '0.8.24')
assert.equal(build.input.settings.optimizer.enabled, true)
assert.equal(build.input.settings.optimizer.runs, 200)
assert.equal(build.input.settings.viaIR, true)
assert.equal(build.input.settings.evmVersion, 'paris')
assert.equal(build.input.sources['src/PersonalSavingsVault.sol'].content.replace(/\r\n/g, '\n'), fs.readFileSync('contracts/src/PersonalSavingsVault.sol', 'utf8').replace(/\r\n/g, '\n'))
assert.equal(artifact.bytecode, '0x' + build.output.contracts['src/PersonalSavingsVault.sol'].PersonalSavingsVault.evm.bytecode.object)
const client = createPublicClient({ transport: http('https://rpc.testnet.arc.network', { timeout: 20_000 }) })
assert.equal(await client.getChainId(), 5_042_002)
const prior = read('contracts/deployments/arc-testnet.json')
const previousDeployment = await client.getTransaction({ hash: prior.repaymentRouter.transactionHash })
const deployer = getAddress(previousDeployment.from)
const asset = getAddress('0x3600000000000000000000000000000000000000')
const blockNumber = await client.getBlockNumber()
const [code, decimals, symbol, balance, nonce, gasPrice] = await Promise.all([
  client.getCode({ address: asset, blockNumber }),
  client.readContract({ address: asset, abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals', blockNumber }),
  client.readContract({ address: asset, abi: parseAbi(['function symbol() view returns (string)']), functionName: 'symbol', blockNumber }),
  client.getBalance({ address: deployer, blockNumber }),
  client.getTransactionCount({ address: deployer, blockTag: 'pending' }),
  client.getGasPrice(),
])
assert.ok(code && code !== '0x')
assert.equal(decimals, 6)
assert.equal(symbol, 'USDC')
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [asset] })
const gas = await client.estimateGas({ account: deployer, data })
const gasWithBuffer = gas * 120n / 100n
console.log(JSON.stringify({ readOnly: true, observedAt: new Date().toISOString(), chainId: 5_042_002, blockNumber: String(blockNumber),
  sourceSha256: manifest.source.normalizedLfSha256, dependencyLockSha256: manifest.toolchain.packageLockNormalizedLfSha256,
  asset, deployer, deployerEvidence: prior.repaymentRouter.transactionHash, deployerSelection: 'Previous escrow transaction sender; requires confirmation as savings deployer',
  pendingNonce: nonce, predictedAddress: getContractAddress({ from: deployer, nonce: BigInt(nonce) }),
  estimatedGas: String(gas), bufferedGas: String(gasWithBuffer), gasPriceWei: String(gasPrice),
  estimatedCostNativeUnits: String(gas * gasPrice), bufferedCostNativeUnits: String(gasWithBuffer * gasPrice),
  balanceNativeUnits: String(balance), sufficientEstimatedGasBalance: balance >= gasWithBuffer * gasPrice,
  broadcast: false, depositsEnabled: false,
}, null, 2))
