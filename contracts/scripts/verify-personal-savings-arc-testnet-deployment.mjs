import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { JsonRpcProvider, Contract, getAddress } from 'ethers'

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''))
const deployment = read('deployments/personal-savings-arc-testnet.json')
const manifest = read('audits/personal-savings-arc-testnet-v1-manifest.json')
assert.equal(deployment.chainId, manifest.target.chainId)
assert.equal(getAddress(deployment.asset), getAddress(manifest.target.asset))
assert.equal(deployment.sourceSha256, manifest.source.normalizedLfSha256)
assert.equal(deployment.dependencyLockSha256, manifest.toolchain.packageLockNormalizedLfSha256)
assert.equal(deployment.depositsEnabled, false)
assert.equal(deployment.externalAuditCompleted, false)
assert.equal(deployment.financialProductionReady, false)
const artifactPath = path.join(root, 'artifacts/src/PersonalSavingsVault.sol/PersonalSavingsVault.json')
const artifact = read('artifacts/src/PersonalSavingsVault.sol/PersonalSavingsVault.json')
const debug = read('artifacts/src/PersonalSavingsVault.sol/PersonalSavingsVault.dbg.json')
const build = JSON.parse(fs.readFileSync(path.resolve(path.dirname(artifactPath), debug.buildInfo), 'utf8'))
const output = build.output.contracts['src/PersonalSavingsVault.sol'].PersonalSavingsVault.evm.deployedBytecode
let expected = '0x' + output.object
const references = Object.values(output.immutableReferences).flat()
assert.ok(references.length > 0)
assert.ok(references.every(reference => reference.length === 32))
const encodedAsset = deployment.asset.slice(2).toLowerCase().padStart(64, '0')
for (const reference of [...references].sort((a, b) => b.start - a.start)) {
  const offset = 2 + reference.start * 2
  expected = expected.slice(0, offset) + encodedAsset + expected.slice(offset + reference.length * 2)
}

const provider = new JsonRpcProvider(process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network', 5_042_002, { staticNetwork: true })
const receipt = await provider.getTransactionReceipt(deployment.transactionHash)
assert.ok(receipt)
assert.equal(receipt.status, 1)
assert.equal(getAddress(receipt.contractAddress), getAddress(deployment.address))
assert.equal(receipt.blockNumber, deployment.blockNumber)
assert.equal((await provider.getCode(deployment.address)).toLowerCase(), expected.toLowerCase())

const vault = new Contract(deployment.address, artifact.abi, provider)
assert.equal(getAddress(await vault.asset()), getAddress(manifest.target.asset))
assert.equal(await vault.WEEKLY(), 604800n)
assert.equal(await vault.MONTHLY(), 2592000n)
assert.equal(await vault.EMERGENCY_EXIT_DELAY(), 172800n)
assert.equal(await vault.MAX_PAGE_SIZE(), 100n)
const totalManaged = await vault.totalManaged()
const token = new Contract(deployment.asset, ['function balanceOf(address) view returns (uint256)'], provider)
const vaultBalance = await token.balanceOf(deployment.address)
assert.ok(vaultBalance >= totalManaged)
console.log(JSON.stringify({
  ok: true,
  network: deployment.network,
  chainId: Number((await provider.getNetwork()).chainId),
  contract: deployment.address,
  transactionHash: deployment.transactionHash,
  deploymentBlock: deployment.blockNumber,
  runtimeBytecodeVerified: true,
  totalManaged: String(totalManaged),
  vaultBalance: String(vaultBalance),
  depositsEnabled: false,
  financialProductionReady: false
}, null, 2))
