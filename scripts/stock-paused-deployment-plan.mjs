import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { getAddress, isAddress, keccak256 } from 'viem'

const contractName = 'AgreementBackedStockDelivery'
const sourcePath = `contracts/src/${contractName}.sol`
const artifactPath = `contracts/artifacts/src/${contractName}.sol/${contractName}.json`
const evidencePath = 'docs/evidence/stock-xlayer-candidate.json'
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
if (evidence.chainId !== 196 || evidence.candidate.wrapper.symbol !== 'wSPYx' || artifact.contractName !== contractName || !/^0x[0-9a-f]+$/i.test(artifact.bytecode) || !/^0x[0-9a-f]+$/i.test(artifact.deployedBytecode)) throw new Error('Unexpected agreement-backed stock delivery candidate.')
const constructorInputs = artifact.abi.find(item => item.type === 'constructor')?.inputs?.map(item => item.name.replace(/_$/, '')) ?? []
if (JSON.stringify(constructorInputs) !== JSON.stringify(['arcRepaymentRouter', 'underwritingSigner', 'riskSigner', 'protectionSigner', 'initialOwner'])) throw new Error('The reviewed constructor order changed.')

const optionalAddress = name => {
  const value = String(process.env[name] ?? '').trim()
  if (!value) return null
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`${name} is not a valid nonzero address.`)
  return getAddress(value)
}
const constructorDraft = {
  arcRepaymentRouter: optionalAddress('HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS'),
  underwritingSigner: optionalAddress('HASHPAYSTREAM_STOCK_UNDERWRITING_SIGNER'),
  riskSigner: optionalAddress('HASHPAYSTREAM_STOCK_RISK_SIGNER'),
  protectionSigner: optionalAddress('HASHPAYSTREAM_STOCK_PROTECTION_SIGNER'),
  ownerMultisig: optionalAddress('HASHPAYSTREAM_STOCK_OWNER_MULTISIG'),
}
const configured = Object.values(constructorDraft).filter(Boolean)
const duplicateRoles = new Set(configured.map(value => value.toLowerCase())).size !== configured.length
const missingRoles = Object.entries(constructorDraft).filter(([, value]) => !value).map(([name]) => name)
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')

const plan = {
  schema: 2,
  chainId: 196,
  status: 'DRAFT_BLOCKED',
  deploymentApproved: false,
  unsignedTransaction: null,
  broadcast: false,
  contract: contractName,
  sourcePath,
  sourceSha256: sha256(sourcePath),
  candidateEvidenceSha256: sha256(evidencePath),
  artifactSha256: sha256(artifactPath),
  creationBytecodeHash: keccak256(artifact.bytecode),
  runtimeBytecodeHash: keccak256(artifact.deployedBytecode),
  compiler: { version: '0.8.24', optimizer: true, optimizerRuns: 200, viaIR: true },
  constructorOrder: ['arcRepaymentRouter', 'underwritingSigner', 'riskSigner', 'protectionSigner', 'ownerMultisig'],
  constructorDraft,
  constructorChecks: {
    missingRoles,
    distinctConfiguredRoles: !duplicateRoles,
    ownerMustBeVerifiedContractMultisigOnXLayer: true,
    signersMustBeSeparatelyControlled: true,
  },
  proposedAsset: {
    address: evidence.candidate.wrapper.address,
    symbol: evidence.candidate.wrapper.symbol,
    decimals: evidence.candidate.wrapper.decimals,
    evidenceBlock: evidence.blockNumber,
    runtimeHash: evidence.candidate.wrapper.runtimeHash,
    implementation: evidence.candidate.wrapper.implementation,
    implementationRuntimeHash: evidence.candidate.wrapper.implementationRuntimeHash,
  },
  immutableContractLimits: {
    minAdvanceBps: 1000,
    maxAdvanceBps: 8000,
    maxFunderFeeBps: 300,
    maxProtectionWindowSeconds: 2592000,
    maxAuthorizationAgeSeconds: 300,
  },
  deploymentPostconditions: {
    paused: true,
    allowedAsset: false,
    allowedFunder: false,
    stockInventoryHeldByContract: '0',
    deliveryVersion: '1',
  },
  requiredBeforeDeployment: [
    'Complete an independent security review of the final contract, API receipt verifier and browser execution adapter',
    'Provide a verified X Layer contract multisig as owner and separately controlled underwriting, risk and protection signers',
    'Verify the exact issuer token, implementation upgrade controls, transfer behavior and participant distribution permission',
    'Approve per-worker, per-funder, per-token and global pilot exposure limits',
    'Recompile from a clean checkout and match the reviewed source, artifact and creation bytecode hashes',
  ],
  requiredBeforeUnpause: [
    'Verify the deployed source, constructor arguments, runtime hash and creation block',
    'Keep the stock asset and every funder disallowed until their individual approval evidence is complete',
    'Prove fresh independent regular-session price, X Layer executable quote, liquidity, volatility and corporate-action checks',
    'Rehearse one full allowlisted tiny delivery and fixed-USDC Arc repayment with incident owners present',
    'Validate the shared settlement runtime and enable HASHPAYSTREAM_STOCK_DELIVERY_SETTLEMENT_ENABLED before accepting stock requests',
    'Enable HASHPAYSTREAM_STOCK_DELIVERY_REQUESTS_ENABLED only after the paused deployment review is signed off',
  ],
}
writeFileSync('docs/evidence/stock-paused-deployment-plan.json', JSON.stringify(plan, null, 2) + '\n')
console.log(`Paused ${contractName} review packet prepared: DRAFT_BLOCKED. No transaction was created or broadcast.`)
