import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const file = path.resolve('output/playwright/funding-receipt-history-fixture.mjs')
await mkdir(path.dirname(file), { recursive: true })
const result = await build({
  stdin: { contents: "import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import Receipt from './src/components/FundingPositionReceipt'; export const render = receipt => renderToStaticMarkup(React.createElement(Receipt,{receipt}));", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', write: false,
  define: { 'import.meta.env': JSON.stringify({ VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID: '196' }) },
  plugins: [{ name: 'observe-shared-receipt', setup(b) {
    b.onResolve({ filter: /^\.\/UnifiedReceipt$/ }, () => ({ path: 'shared', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default function({receipt}) { globalThis.__fundingSharedReceipt = receipt; return null }', loader: 'js' }))
  } }],
})
await writeFile(file, result.outputFiles[0].text)
try {
  const { render } = await import(pathToFileURL(file).href)
  const receipt = { positionId: '0x' + '12'.repeat(32), status: 'refunded', escrowAddress: '0x2222222222222222222222222222222222222222', advanceUsdcUnits: '20000000', repaymentUsdcUnits: '20000000', profitUsdcUnits: '0', platformFeeUsdcUnits: '1000000' }
  const historical = render({ ...receipt, xLayerChainId: 1952 })
  assert.match(historical, /xlayer-test\/address\/0x2222/)
  assert.equal(globalThis.__fundingSharedReceipt.chain, 'xlayer-testnet')
  const current = render({ ...receipt, xLayerChainId: 196 })
  assert.match(current, /xlayer\/address\/0x2222/)
  assert.equal(globalThis.__fundingSharedReceipt.chain, 'xlayer-mainnet')
  render(receipt)
  assert.equal(globalThis.__fundingSharedReceipt.chain, 'xlayer-mainnet')
  const unknown = render({ ...receipt, xLayerChainId: 999 })
  assert.doesNotMatch(unknown, /\/address\//)
  assert.equal(globalThis.__fundingSharedReceipt.chain, 'unknown')
  render({ ...receipt, xLayerChainId: 1952, status: 'settled' })
  assert.equal(globalThis.__fundingSharedReceipt.chain, 'arc-testnet')
  console.log('Rendered funding receipts use the original network for explorer links and shared receipt input.')
} finally {
  delete globalThis.__fundingSharedReceipt
  await unlink(file)
}
