import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = relative => readFileSync(path.join(root, relative), 'utf8')

function sourceFiles(relative) {
  const absolute = path.join(root, relative)
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const next = path.join(relative, entry.name)
    return entry.isDirectory() ? sourceFiles(next) : [next]
  })
}

const server = read('server.ts')
const app = read('src/App.tsx')
const main = read('src/main.tsx')
const form = read('src/components/agreements/FixedAgreementForm.tsx')
const dashboard = read('src/components/agreements/AgreementDashboard.tsx')
const unifiedReceipt = read('src/components/UnifiedReceipt.tsx')
const receiptPdf = read('src/lib/paymentReceiptPdf.ts')
const signInLanding = read('src/components/agreements/AgreementSignInLanding.tsx')
const sessionSplash = read('src/lib/useHashPayStreamSessionSplash.ts')
const envExample = read('.env.example')
const packageLock = JSON.parse(read('package-lock.json'))

assert.match(server, /app\.get\('\/healthz'/)
assert.match(server, /app\.get\('\/api\/hashpaystream\/v2\/agreements'/)
assert.match(server, /app\.post\('\/api\/hashpaystream\/v2\/agreements'/)
assert.match(server, /app\.get\('\/api\/hashpaystream\/v1\/agent\/agreements'/)
assert.match(server, /app\.post\('\/api\/hashpaystream\/v1\/agent\/agreements'/)
assert.match(server, /app\.all\(\s*'\/api\/hashpaystream\/arc-agreement-webhook'/)
assert.match(server, /app\.all\(\s*'\/api\/hashpaystream\/v1\/agent\/arc-agreement-webhook'/)
assert.ok(
  server.indexOf("'/api/hashpaystream/arc-agreement-webhook'")
    < server.indexOf("app.use(express.json({ limit: '64kb' }))"),
  'Signed webhook raw-body route must precede the global JSON parser.',
)
assert.ok(
  server.indexOf("'/api/hashpaystream/v1/agent/arc-agreement-webhook'")
    < server.indexOf("app.use(express.json({ limit: '64kb' }))"),
  'Signed agent webhook raw-body route must precede the global JSON parser.',
)
assert.doesNotMatch(server, /script-src[^"\n]*'unsafe-inline'/)
assert.doesNotMatch(server, /script-src[^"\n]*'unsafe-eval'/)
assert.doesNotMatch(server, /connect-src[^"\n]*\shttps:\s/)
assert.doesNotMatch(server, /connect-src[^"\n]*\swss:\s/)
assert.match(server, /object-src 'none'/)
assert.match(server, /worker-src 'self'/)
assert.match(server, /app\.all\('\/api\/hashpaystream\/v2\/agreements'/)
assert.match(server, /app\.use\('\/api\/hashpaystream'/)
assert.ok(
  server.indexOf("app.use('/api/hashpaystream'") < server.indexOf('app.use(express.static'),
  'Unknown API routes must fail before the SPA fallback.',
)

assert.match(app, /route === '\/'/)
assert.match(app, /route === '\/docs'/)
assert.match(app, /route === '\/agreements'/)
assert.match(app, /route === '\/agreements\/new'/)
assert.match(app, /<Navigate to="\/" replace\s*\/>/)
assert.match(form, /\/api\/hashpaystream\/v2\/agreements/)
assert.match(dashboard, /\/api\/hashpaystream\/v2\/agreements/)
assert.match(dashboard, /<AgreementSignInLanding splashState=\{splashState\}\s*\/>/)
assert.match(signInLanding, /HashPay<span className="text-blue-500">Stream<\/span>/)
assert.match(signInLanding, /Continue with email/)
assert.match(signInLanding, /Your protected payments\./)
assert.match(signInLanding, /Powered by Arc/)
assert.match(signInLanding, /motion-reduce:hidden/)
assert.match(sessionSplash, /window\.sessionStorage/)
assert.match(sessionSplash, /prefers-reduced-motion: reduce/)
assert.doesNotMatch(form + dashboard, /\/api\/hashpaystream\/arc-agreements/)
assert.match(dashboard, /`\$\{HASH_PAYLINK_ORIGIN\}\/agreements\/\$\{active\.id\}`/)
assert.match(unifiedReceipt, /View on Arc Explorer/)
assert.match(receiptPdf, /https:\/\/testnet\.arcscan\.app/)
assert.match(receiptPdf, /\/Subtype \/Link/)
assert.match(receiptPdf, /\/S \/URI/)
assert.match(receiptPdf, /\^0x\[a-fA-F0-9\]\{64\}\$/)

assert.match(main, /loginMethods:\s*\['email'\]/)
assert.match(main, /createOnLogin:\s*'off'/)
assert.match(main, /disableAllExternalWallets:\s*true/)
assert.match(main, /logo:\s*logoUrl/)
assert.match(main, /landingHeader:\s*'HashPayStream'/)
assert.match(main, /loginMessage:\s*'Our team will never ask for your login code\.'/)

const browserSource = sourceFiles('src')
  .filter(file => /\.(?:ts|tsx|js|jsx)$/.test(file))
  .map(file => read(file))
  .join('\n')
for (const forbidden of [
  'PRIVY_APP_SECRET',
  'HASHPAYSTREAM_ARC_API_KEY',
  'HASHPAYSTREAM_ARC_WEBHOOK_SECRET',
  'HASHPAYSTREAM_APP_OWNERSHIP_SECRET',
  'DATABASE_URL',
  'POSTGRES_URL',
  'x-api-key',
  'HASHPAYSTREAM_AGENT_API_KEY',
  'HASHPAYSTREAM_AGENT_ARC_API_KEY',
  'HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET',
]) {
  assert.equal(browserSource.includes(forbidden), false, `Browser source contains forbidden server secret name: ${forbidden}`)
}
const viteNames = [...browserSource.matchAll(/VITE_[A-Z0-9_]+/g)].map(match => match[0])
assert.deepEqual([...new Set(viteNames)].sort(), ['VITE_HASH_PAYLINK_BASE_URL', 'VITE_PRIVY_APP_ID'])

const runtimeSource = [
  ...sourceFiles('src'),
  ...sourceFiles('api'),
  'server.ts',
].filter(file => /\.(?:ts|tsx|js|jsx)$/.test(file)).map(file => read(file)).join('\n')
for (const forbidden of [
  'modules/streampay',
  'polymarket-lp-sentinel',
  'hashkey-paylink',
  'StreamGate',
  'X402Receipt',
  'StreamAgentHash',
  '/arena',
  '/creator',
  '/payroll',
]) {
  assert.equal(runtimeSource.includes(forbidden), false, `Standalone runtime contains forbidden reference: ${forbidden}`)
}

for (const serverOnly of [
  'PRIVY_APP_SECRET',
  'HASHPAYSTREAM_ARC_API_KEY',
  'HASHPAYSTREAM_ARC_WEBHOOK_SECRET',
  'HASHPAYSTREAM_APP_OWNERSHIP_SECRET',
  'DATABASE_URL',
  'HASHPAYSTREAM_AGENT_API_KEY',
  'HASHPAYSTREAM_AGENT_ARC_API_KEY',
  'HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET',
]) {
  assert.match(envExample, new RegExp(`(?:^|\\n)${serverOnly}=`))
  assert.equal(envExample.includes(`VITE_${serverOnly}=`), false)
}

const packageEntries = Object.entries(packageLock.packages ?? {})
assert.equal(packageEntries.some(([, value]) => value?.link === true), false)
assert.equal(JSON.stringify(packageLock).includes('polymarket-lp-sentinel'), false)
assert.equal(JSON.stringify(packageLock).includes('hashkey-paylink'), false)
assert.equal(JSON.stringify(packageLock).includes('node_modules/react-router'), false)
assert.doesNotMatch(browserSource, /from ['"]react-router(?:-dom)?['"]/)

console.log('HashPayStream standalone route and browser-secret smoke checks passed.')
