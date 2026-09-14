import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const manifestPath = 'docs/evidence/stock-delivery-release-manifest.json'
const files = [
  '.env.example',
  'api/stock-delivery-offers.ts',
  'api/stock-delivery-opportunities.ts',
  'api/stock-delivery-settlement-targets.ts',
  'api/stock-delivery-settlement-worker.ts',
  'api/stock-delivery-terms.ts',
  'api/stock-delivery-workflow.ts',
  'api/upfront-assessment.ts',
  'api/upfront-settlement-runtime.ts',
  'api/upfront-settlement-worker.ts',
  'contracts/src/AgreementBackedStockDelivery.sol',
  'contracts/test/AgreementBackedStockDelivery.test.ts',
  'render.yaml',
  'scripts/stock-delivery-offers-smoke.mjs',
  'scripts/stock-delivery-opportunities-smoke.mjs',
  'scripts/stock-delivery-settlement-preflight-smoke.mjs',
  'scripts/stock-delivery-settlement-preflight.ts',
  'scripts/stock-delivery-settlement-targets-smoke.mjs',
  'scripts/stock-delivery-settlement-worker-smoke.mjs',
  'scripts/stock-delivery-terms-smoke.mjs',
  'scripts/stock-delivery-workflow-smoke.mjs',
  'scripts/upfront-settlement-daemon.ts',
  'scripts/upfront-settlement-runtime-smoke.mjs',
  'server.ts',
  'src/components/StockDeliveryFunderPanel.tsx',
  'src/components/StockDeliveryPicker.tsx',
  'src/components/StreamPayFunding.tsx',
  'src/components/StreamPayFundingDesk.tsx',
  'src/components/StreamPayRequests.tsx',
  'src/components/StreamPayUpfront.tsx',
  'src/lib/stockDeliveryProtocol.ts',
]

const sha256 = path => createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
const current = {
  schema: 1,
  release: 'agreement-backed-stock-delivery-v1',
  status: 'EXTERNAL_REVIEW_REQUIRED',
  financialProductionReady: false,
  architecture: {
    stockCustody: 'direct-funder-to-worker-wallet',
    stockChainId: 196,
    repaymentSource: 'protected-Arc-agreement-USDC',
    contractHoldsStock: false,
  },
  files: Object.fromEntries(files.map(path => {
    if (!existsSync(path)) throw new Error(`Review file is missing: ${path}`)
    return [path, sha256(path)]
  })),
}

if (process.argv.includes('--write')) {
  writeFileSync(manifestPath, JSON.stringify(current, null, 2) + '\n')
  console.log(`Wrote ${manifestPath} with ${files.length} reviewed files.`)
} else {
  if (!existsSync(manifestPath)) throw new Error(`Review manifest is missing: ${manifestPath}`)
  const expected = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (JSON.stringify(expected) !== JSON.stringify(current)) {
    throw new Error('The stock delivery review boundary changed. Run npm run stock:review-manifest and review the resulting hash changes.')
  }
  console.log(`Verified ${files.length} stock delivery review hashes.`)
}
