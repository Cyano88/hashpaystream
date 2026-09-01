import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextSavingsRelease, savingsPlanPreview } from '../src/lib/savingsSchedule.ts'

const DAY = 24 * 60 * 60
const firstReleaseAt = 1_800_000_000
const weekly = 7 * DAY

function plan(overrides = {}) {
  return {
    deposited: 10_000_000n,
    remaining: 10_000_000n,
    withdrawable: 0n,
    releaseAmount: 3_000_000n,
    firstReleaseAt,
    interval: weekly,
    emergencyExitAt: 0,
    ...overrides,
  }
}

assert.equal(nextSavingsRelease(plan(), firstReleaseAt - 1), firstReleaseAt)
assert.equal(nextSavingsRelease(plan(), firstReleaseAt), firstReleaseAt + weekly)
assert.equal(nextSavingsRelease(plan(), firstReleaseAt + weekly), firstReleaseAt + 2 * weekly)
assert.equal(nextSavingsRelease(plan(), firstReleaseAt + 3 * weekly), 0)
assert.equal(nextSavingsRelease(plan({ withdrawable: 10_000_000n }), firstReleaseAt - 1), 0)
assert.equal(nextSavingsRelease(plan({ remaining: 0n }), firstReleaseAt - 1), 0)
assert.equal(nextSavingsRelease(plan({ emergencyExitAt: firstReleaseAt - DAY }), firstReleaseAt - 2 * DAY), firstReleaseAt - DAY)
assert.equal(nextSavingsRelease(plan({ emergencyExitAt: firstReleaseAt - DAY }), firstReleaseAt - DAY), 0)
assert.equal(nextSavingsRelease(plan({ emergencyExitAt: firstReleaseAt + DAY }), firstReleaseAt), firstReleaseAt + DAY)

assert.deepEqual(savingsPlanPreview(10_000_000n, 3_000_000n, weekly, firstReleaseAt), {
  releases: 4,
  firstReleaseAt: firstReleaseAt + weekly,
  finalReleaseAt: firstReleaseAt + 4 * weekly,
  finalReleaseAmount: 1_000_000n,
})
assert.equal(savingsPlanPreview(10_000_000n, 0n, weekly, firstReleaseAt), undefined)
assert.equal(savingsPlanPreview(10_000_000n, 11_000_000n, weekly, firstReleaseAt), undefined)
assert.equal(savingsPlanPreview(10_000_000n, 1_000_000n, 0, firstReleaseAt), undefined)

const hookSource = readFileSync(new URL('../src/lib/useSavingsVault.ts', import.meta.url), 'utf8')
const contractSource = readFileSync(new URL('../contracts/src/PersonalSavingsVault.sol', import.meta.url), 'utf8')
const deploySource = readFileSync(new URL('../contracts/scripts/deploy-savings-mainnet.ts', import.meta.url), 'utf8')
assert.match(hookSource, /functionName: 'planCount'/)
assert.match(hookSource, /functionName: 'planIdsPage'/)
assert.match(hookSource, /blockNumber: snapshotBlock/)
assert.doesNotMatch(hookSource, /ids\.length > 100/)
assert.match(contractSource, /MAX_PAGE_SIZE = 100/)
assert.match(contractSource, /function planIdsPage/)
assert.doesNotMatch(contractSource, /function planIds\(/)
assert.match(contractSource, /address\(asset_\)\.code\.length == 0/)
assert.match(contractSource, /EmergencyExitAlreadyRequested/)
assert.match(deploySource, /DEPLOY_NONCUSTODIAL_USDC_SAVINGS_V3/)
assert.match(deploySource, /MAX_PAGE_SIZE\(\) !== 100n/)

console.log('HashPayStream savings schedule and pagination smoke checks passed.')
