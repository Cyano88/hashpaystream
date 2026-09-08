// Application-to-reviewed-contract integration. Synthetic funds and loopback nodes only.
// Usage: node --import tsx scripts/upfront-reviewed-contracts-local.mjs <frozen-harness> <upstream-checkout>
import assert from 'node:assert/strict'
import { runUpfrontSettlementPass } from '../api/upfront-settlement-worker.ts'
import { verifySettlementReceipt, recoverSettlementEvidence } from '../api/upfront-settlement-evidence.ts'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPublicClient, createWalletClient, http, hashTypedData, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { buildAgreementIntelligenceRequest, agreementIntelligenceRequestHash } from '../api/agreement-intelligence-schema.ts'
import { buildPolyDeskUnderwritingRequest, verifyPolyDeskDecision } from '../api/polydesk-upfront-client.ts'
import { signFundingTerms, FUNDING_TERMS_TYPES, fundingTermsHash } from '../api/upfront-funding-terms.ts'
import { signProtectionAttestation, signSplitSettlement } from '../api/upfront-protection-attestation.ts'

assert.equal(process.argv.length, 4, 'Supply the frozen contract harness and upstream checkout paths.')
const harness = resolve(process.argv[2])
const upstream = await import(pathToFileURL(join(resolve(process.argv[3]), 'src/polydesk-upfront-underwriting.ts')).href)
const folder = await mkdtemp(join(tmpdir(), 'hps-reviewed-local-'))
const children = []
const keys = Array.from({ length: 7 }, (_, i) => '0x' + (i + 1).toString(16).padStart(2, '0').repeat(32))
const [owner, underwriter, protectionSigner, funder, provider, providerArc, treasury] = keys.map(privateKeyToAccount)
const digest = text => keccak256(toBytes(text))
const unitsMessage = (message, fields) => Object.fromEntries(Object.entries(message).map(([key, value]) => [key, fields.includes(key) ? BigInt(value) : value]))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function unusedPort() {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function node(chainId) {
  const port = await unusedPort()
  const config = join(folder, `hardhat-${chainId}.cjs`)
  await writeFile(config, 'module.exports=' + JSON.stringify({ solidity: '0.8.24', networks: { hardhat: { chainId, accounts: keys.map(privateKey => ({ privateKey, balance: '100000000000000000000' })) } } }))
  // Deliberately exclude all inherited wallet, deployment and provider variables.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(SystemRoot|WINDIR|PATH|TEMP|TMP|HOME|USERPROFILE)$/i.test(key)))
  const child = spawn(process.execPath, [join(harness, 'node_modules/hardhat/internal/cli/cli.js'), '--config', config, 'node', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: harness, env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  children.push(child)
  let spawnError
  let diagnostic = ''
  child.stderr.on('data', data => { diagnostic = (diagnostic + data.toString()).slice(-2000) })
  child.on('error', error => { spawnError = error })
  const url = `http://127.0.0.1:${port}`
  assert.equal(new URL(url).hostname, '127.0.0.1')
  const chain = { id: chainId, name: 'Owned synthetic local node', nativeCurrency: { name: 'Test Ether', symbol: 'TEST', decimals: 18 }, rpcUrls: { default: { http: [url] } } }
  const client = createPublicClient({ chain, transport: http(url, { retryCount: 0, timeout: 1000 }), pollingInterval: 20 })
  let ready = false
  for (let attempt = 0; attempt < 300; attempt++) {
    if (spawnError) throw spawnError
    if (child.exitCode !== null) throw new Error('Owned local Hardhat node exited before readiness: ' + diagnostic)
    try { assert.equal(await client.getChainId(), chainId); ready = true; break } catch { await delay(100) }
  }
  assert.ok(ready, 'Owned local Hardhat node did not become ready: ' + diagnostic)
  const wallet = account => createWalletClient({ account, chain, transport: http(url, { retryCount: 0 }) })
  const send = async (contract, functionName, args = [], account = owner) => {
    const { request } = await client.simulateContract({ address: contract.address, abi: contract.abi, functionName, args, account })
    const receipt = await client.waitForTransactionReceipt({ hash: await wallet(account).writeContract(request) })
    assert.equal(receipt.status, 'success')
    return receipt
  }
  const read = (contract, functionName, args = []) => client.readContract({ address: contract.address, abi: contract.abi, functionName, args })
  const deploy = async (name, args = []) => {
    const source = name === 'MockUSDC' ? 'test/MockUSDC' : name
    const artifact = JSON.parse(await readFile(join(harness, `artifacts/src/${source}.sol/${name}.json`), 'utf8'))
    const receipt = await client.waitForTransactionReceipt({ hash: await wallet(owner).deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args }) })
    assert.equal(receipt.status, 'success')
    assert.ok(receipt.contractAddress)
    return { address: receipt.contractAddress, abi: artifact.abi }
  }
  return { client, send, read, deploy, now: async () => new Date(Number((await client.getBlock()).timestamp) * 1000) }
}
try {
  await writeFile(join(folder, 'package.json'), '{"private":true}')
  const x = await node(196)
  const arc = await node(5042002)
  const tokenX = await x.deploy('MockUSDC')
  const tokenArc = await arc.deploy('MockUSDC')
  const router = await arc.deploy('ArcRepaymentRouterV4', [tokenArc.address, protectionSigner.address, treasury.address, owner.address])
  const escrow = await x.deploy('UpfrontAdvanceEscrowV2', [tokenX.address, router.address, underwriter.address, protectionSigner.address, owner.address])
  assert.equal(await x.read(escrow, 'paused'), true)
  assert.equal(await arc.read(router, 'paused'), true)
  await x.send(escrow, 'setFunderAllowed', [funder.address, true])
  await x.send(escrow, 'setPaused', [false])
  await x.send(tokenX, 'mint', [funder.address, 1_000_000_000n])
  await x.send(tokenX, 'approve', [escrow.address, 1_000_000_000n], funder)
  const signingSecret = 'synthetic-only-envelope-secret-with-32-characters'
  const serviceToken = 'synthetic-only-service-token-with-32-characters'
  async function fund(seed) {
    const now = await x.now()
    const request = buildAgreementIntelligenceRequest({ requestId: 'uai_' + digest(seed).slice(2, 34), issuedAt: now.toISOString(), providerIdentity: 'synthetic-provider', providerReferenceSecret: 'synthetic-only-provider-reference-secret', providerArcAddress: providerArc.address,
      draft: { template: 'fixed_unlock', title: 'Local integration delivery', description: 'Deliver a cited research brief for payer review.', amount: '100.25', durationSeconds: 86400, cancellationWindowSeconds: 900, providerPayoutAddress: provider.address, requestedAdvanceBps: 3000 },
      trustedEvidence: { agreementState: 'funded', protectionDeadline: Math.floor(now.getTime() / 1000) + 86400, providerHistoryIncluded: false, sources: ['arc-funded-agreement'], dataGaps: ['provider-history'] } })
    const intelligence = { schema: 'zeroscout.agreement-intelligence.result', schemaVersion: '1.0.0', requestCommitment: agreementIntelligenceRequestHash(request), recommendation: 'proceed', confidence: 90, evidenceGrade: 'standard', deliveryClarityScore: 90, recommendedMaxAdvanceBps: 3000, reasonCodes: [], proof: { contentHash: digest('synthetic-proof') } }
    const handler = upstream.createPolyDeskUpfrontUnderwritingHandler({ now: () => now, env: () => ({ POLYDESK_UPFRONT_ENABLED: 'true', POLYDESK_UPFRONT_SERVICE_TOKEN: serviceToken, POLYDESK_UPFRONT_SIGNING_SECRET: signingSecret, POLYDESK_UPFRONT_SIGNING_KEY_ID: 'local-only', POLYDESK_UPFRONT_EIP712_PRIVATE_KEY: keys[1], POLYDESK_UPFRONT_ESCROW_CONTRACT_ADDRESS: escrow.address, POLYDESK_UPFRONT_CHAIN_ID: '196', POLYDESK_UPFRONT_EIP712_VERSION: '2' }) })
    const response = { statusCode: 0, body: null, setHeader() {}, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this } }
    await handler({ method: 'POST', headers: { authorization: 'Bearer ' + serviceToken }, body: buildPolyDeskUnderwritingRequest(request, intelligence) }, response)
    assert.equal(response.statusCode, 200, response.body?.error)
    const verified = await verifyPolyDeskDecision(response.body, { request, intelligence, signingSecret, expectedKeyId: 'local-only', expectedSigner: underwriter.address, escrowContract: escrow.address, chainId: 196, escrowVersion: '2', now })
    assert.equal(verified.decision, 'APPROVE')
    const offer = verified.onchainOffer
    const offerMessage = unitsMessage(offer.message, ['protectedAmount'])
    const positionId = hashTypedData({ domain: offer.domain, types: upstream.UPFRONT_UNDERWRITING_TYPES, primaryType: 'UnderwritingOffer', message: offerMessage })
    assert.equal(await x.read(escrow, 'hashUnderwritingOffer', [offerMessage]), positionId)
    const signed = await signFundingTerms({ offerHash: positionId, funder: funder.address, providerArcRecipient: providerArc.address, platformTreasury: treasury.address, advanceAmount: BigInt(request.advance.requestedUsdcUnits), protectedAmount: BigInt(request.agreement.amountUsdcUnits), durationSeconds: request.agreement.durationSeconds, deadline: offer.message.underwritingDeadline, nonce: digest('fund-' + seed), chainId: 196, escrow: escrow.address, escrowVersion: '2', privateKey: keys[2] })
    const terms = unitsMessage(signed.message, ['advanceAmount', 'funderRepaymentAmount', 'platformFeeAmount'])
    assert.equal(await x.read(escrow, 'hashFundingTerms', [terms]), fundingTermsHash(signed))
    const consent = await provider.signTypedData({ domain: signed.domain, types: FUNDING_TERMS_TYPES, primaryType: 'FundingTerms', message: terms })
    const legacyConsent = await provider.signTypedData({ domain: { ...signed.domain, version: '1' }, types: FUNDING_TERMS_TYPES, primaryType: 'FundingTerms', message: terms })
    await assert.rejects(() => x.send(escrow, 'fundAdvance', [offerMessage, terms, offer.signature, signed.signature, legacyConsent], funder), /InvalidSignature/)
    await x.send(escrow, 'fundAdvance', [offerMessage, terms, offer.signature, signed.signature, consent], funder)
    const stored = await x.read(escrow, 'positions', [positionId])
    assert.equal(Number(stored[15]), 1)
    const position = { positionId, funder: stored[0], repaymentRecipient: stored[1], provider: stored[2], providerArcRecipient: stored[3], platformTreasury: stored[4], termsHash: stored[6], fundingTermsHash: stored[7], intelligenceCommitment: stored[8], protectedAmount: stored[10].toString(), advanceAmount: stored[11].toString(), funderRepaymentAmount: stored[12].toString(), platformFeeAmount: stored[13].toString(), protectionDeadline: Number(stored[14]), status: 'Funded' }
    const agreement = { id: 'agr_' + digest(seed).slice(2, 26), status: 'active', template: 'fixed_unlock', title: request.agreement.title, description: request.agreement.deliveryDescription, amount: '100.25', recipient: router.address, durationSeconds: request.agreement.durationSeconds, cancellationWindowSeconds: request.agreement.cancellationWindowSeconds,
      chain: { network: 'arc', chainId: 5042002, onchainAgreementId: digest('agreement-' + seed), termsHash: digest('arc-terms-' + seed), amountUsdcUnits: position.protectedAmount, releasedUsdcUnits: '0', remainingUsdcUnits: position.protectedAmount, expiresAt: String(position.protectionDeadline) } }
    return { request, position, agreement }
  }
  const funded = await fund('release')
  const releaseInput = { ...funded, arcRouter: router.address, xLayerChainId: 196, xLayerEscrow: escrow.address, privateKey: keys[2], now: await x.now(), minimumRemainingSeconds: 21600 }
  const legacyRelease = await signProtectionAttestation({ ...releaseInput, escrowVersion: '1' })
  await assert.rejects(() => x.send(escrow, 'releaseAdvance', [unitsMessage(legacyRelease.message, ['protectedAmount', 'advanceAmount']), legacyRelease.signature]), /InvalidSignature/)
  const release = await signProtectionAttestation({ ...releaseInput, escrowVersion: '2' })
  await x.send(escrow, 'releaseAdvance', [unitsMessage(release.message, ['protectedAmount', 'advanceAmount']), release.signature])
  assert.equal(await x.read(tokenX, 'balanceOf', [provider.address]), BigInt(funded.position.advanceAmount))
  assert.equal(Number((await x.read(escrow, 'positions', [funded.position.positionId]))[15]), 2)
  console.log('PASS: upstream underwriting, app verification, funding consent and protected release accepted by V2; legacy signatures rejected.')
  await assert.rejects(() => x.send(escrow, 'refundAdvance', [funded.position.positionId], funder), /PositionNotFunded/)
  for (const terminalStatus of ['cancelled', 'refunded']) {
    await assert.rejects(() => signSplitSettlement({ request: funded.request, position: { ...funded.position, status: 'Released' }, agreement: { ...funded.agreement, status: terminalStatus }, arcRouter: router.address, privateKey: keys[2], now: new Date(), escrowVersion: '2' }), /completed Arc agreement/)
  }
  console.log('CONFIRMED LIMITATION: released advances cannot be refunded and cancelled/refunded Arc agreements cannot authorize repayment.')


  // Simulated authoritative agreement completion and repayment source: no real bridge/provider claim.
  const completed = { ...funded.agreement, status: 'completed', chain: { ...funded.agreement.chain, releasedUsdcUnits: funded.position.protectedAmount, remainingUsdcUnits: '0' } }
  const splitInput = { request: funded.request, position: { ...funded.position, status: 'Released' }, agreement: completed, arcRouter: router.address, privateKey: keys[2], now: await arc.now() }
  const split = await signSplitSettlement({ ...splitInput, escrowVersion: '2' })
  const splitMessage = unitsMessage(split.message, ['funderAmount', 'providerAmount', 'treasuryAmount'])
  await arc.send(tokenArc, 'mint', [router.address, BigInt(funded.position.protectedAmount)])
  await assert.rejects(() => arc.send(router, 'settleRepayment', [splitMessage, split.signature]), /EnforcedPause/)
  await arc.send(router, 'setPaused', [false])
  const wrongTreasury = await signSplitSettlement({ ...splitInput, position: { ...splitInput.position, platformTreasury: owner.address }, escrowVersion: '2' })
  await assert.rejects(() => arc.send(router, 'settleRepayment', [unitsMessage(wrongTreasury.message, ['funderAmount', 'providerAmount', 'treasuryAmount']), wrongTreasury.signature]), /TreasuryMismatch/)
  const legacySplit = await signSplitSettlement({ ...splitInput, escrowVersion: '1' })
  await assert.rejects(() => arc.send(router, 'settleRepayment', [splitMessage, legacySplit.signature]), /InvalidSignature/)
  const journalFile = join(folder, 'worker-journal.json')
  await writeFile(journalFile, JSON.stringify({ schema: 1, records: { rehearsal: {
    status: 'completed', request: funded.request, agreementId: completed.id,
    fundingRequest: { status: 'pending', fundingTerms: { message: { offerHash: funded.position.positionId } } },
  } } }))
  let broadcasts = 0, failDatabaseWrite = true
  const readJournal = async () => JSON.parse(await readFile(journalFile, 'utf8'))
  const environment = {
    HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED: 'true', HASHPAYSTREAM_UPFRONT_ESCROW_VERSION: '2',
    HASHPAYSTREAM_UPFRONT_STORE_KEY: 'synthetic:local-worker', HASHPAYSTREAM_UPFRONT_ARC_API_KEY: 'hpl_test_' + 'a'.repeat(40),
    HASHPAYSTREAM_HASH_PAYLINK_BASE_URL: 'https://unused.invalid', HASHPAYSTREAM_XLAYER_RPC_URL: 'https://unused.invalid',
    HASHPAYSTREAM_ARC_RPC_URL: 'https://unused.invalid', HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS: escrow.address,
    HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS: router.address, HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY: keys[2],
    HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER: protectionSigner.address,
  }
  const now = await arc.now()
  const worker = {
    env: () => environment, now: () => now, readStore: readJournal, log: () => {},
    position: async () => ({ ...funded.position, status: Number((await x.read(escrow, 'positions', [funded.position.positionId]))[15]) === 2 ? 'Released' : 'Funded', arcAgreementHash: funded.agreement.chain.onchainAgreementId }),
    agreement: async () => completed,
    isSettled: agreementHash => arc.read(router, 'settledAgreements', [agreementHash]),
    blockNumber: () => arc.client.getBlockNumber({ cacheTime: 0 }),
    recover: checkpoint => recoverSettlementEvidence(arc.client, checkpoint),
    saveCheckpoint: async (_key, recordKey, checkpoint) => {
      const journal = await readJournal(); journal.records[recordKey].fundingRequest.settlementCheckpoint = checkpoint
      await writeFile(journalFile, JSON.stringify(journal))
    },
    submit: async signed => {
      broadcasts++
      const receipt = await arc.send(router, 'settleRepayment', [unitsMessage(signed.message, ['funderAmount', 'providerAmount', 'treasuryAmount']), signed.signature])
      await arc.client.request({ method: 'evm_mine', params: [] })
      await new Promise(resolve => setTimeout(resolve, 25))
      return verifySettlementReceipt(arc.client, router.address, signed.message.arcAgreementHash, receipt.transactionHash)
    },
    markSettled: async (_key, recordKey, evidence) => {
      if (failDatabaseWrite) { failDatabaseWrite = false; throw Error('SIMULATED_DATABASE_FAILURE') }
      const journal = await readJournal(); Object.assign(journal.records[recordKey].fundingRequest, { status: 'settled', settlementEvidence: evidence })
      await writeFile(journalFile, JSON.stringify(journal))
    },
  }
  const first = await runUpfrontSettlementPass(worker)
  assert.deepEqual(first.codes, ['SIMULATED_DATABASE_FAILURE'])
  assert.equal(broadcasts, 1)
  assert.equal((await readJournal()).records.rehearsal.fundingRequest.status, 'pending')
  const retry = await runUpfrontSettlementPass(worker)
  assert.equal(retry.alreadySettled, 1)
  assert.equal(broadcasts, 1)
  const proof = (await readJournal()).records.rehearsal.fundingRequest.settlementEvidence
  assert.equal(proof.chainId, 5042002)
  assert.equal(proof.router.toLowerCase(), router.address.toLowerCase())
  assert.equal(proof.funderAmount, splitMessage.funderAmount.toString())
  assert.equal(proof.providerAmount, splitMessage.providerAmount.toString())
  assert.equal(proof.treasuryAmount, splitMessage.treasuryAmount.toString())
  assert.equal((await runUpfrontSettlementPass(worker)).eligible, 0)
  console.log('PASS: actual V4 transaction evidence survives failed state write; new worker pass recovers from disk checkpoint with exactly one broadcast.')
  for (const [address, amount] of [[funder.address, splitMessage.funderAmount], [providerArc.address, splitMessage.providerAmount], [treasury.address, splitMessage.treasuryAmount]]) assert.equal(await arc.read(tokenArc, 'balanceOf', [address]), amount)
  assert.equal(await arc.read(tokenArc, 'balanceOf', [router.address]), 0n)
  await assert.rejects(() => arc.send(router, 'settleRepayment', [splitMessage, split.signature]), /AgreementAlreadyCredited/)
  console.log('PASS: V4 paused state, immutable treasury, exact three-party split, legacy-signature rejection and replay prevention.')

  const refund = await fund('refund')
  const before = await x.read(tokenX, 'balanceOf', [funder.address])
  await assert.rejects(() => x.send(escrow, 'refundAdvance', [refund.position.positionId], funder), /ProtectionNotExpired/)
  await x.client.request({ method: 'evm_setNextBlockTimestamp', params: [refund.position.protectionDeadline + 1] })
  await x.client.request({ method: 'evm_mine', params: [] })
  await x.send(escrow, 'setPaused', [true])
  assert.equal(await x.read(escrow, 'paused'), true)
  await x.send(escrow, 'refundAdvance', [refund.position.positionId], funder)
  assert.equal(await x.read(tokenX, 'balanceOf', [funder.address]), before + BigInt(refund.position.advanceAmount))
  assert.equal(Number((await x.read(escrow, 'positions', [refund.position.positionId]))[15]), 3)
  console.log('PASS: unreleased advance refunds exactly after deadline while funding and releases are paused. Local synthetic lifecycle complete; no external chain or provider calls.')
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.pid) {
      const closed = new Promise(resolve => child.once('close', resolve))
      child.kill()
      await closed
    }
  }
  assert.equal(resolve(folder, '..'), resolve(tmpdir()), 'Only remove our own temporary rehearsal directory')
  await rm(folder, { recursive: true, force: true })
}
