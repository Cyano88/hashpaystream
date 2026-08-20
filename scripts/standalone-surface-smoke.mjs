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
const gracefulShutdown = read('api/graceful-shutdown.ts')
const agentAuth = read('api/agent-auth.ts')
const agreementGateway = read('api/agreement-gateway.ts')
const arcWebhook = read('api/arc-agreement-webhook.ts')
const adminAnalytics = read('api/admin-analytics.ts')
const publicStats = read('api/public-stats.ts')
const app = read('src/App.tsx')
const main = read('src/main.tsx')
const form = read('src/components/agreements/FixedAgreementForm.tsx')
const dashboard = read('src/components/agreements/AgreementDashboard.tsx')
const analyticsDashboard = read('src/components/admin/StreamPayAnalytics.tsx')
const statsPage = read('src/components/StreamPayStats.tsx')
const upfrontPage = read('src/components/StreamPayUpfront.tsx')
const unifiedReceipt = read('src/components/UnifiedReceipt.tsx')
const receiptPdf = read('src/lib/paymentReceiptPdf.ts')
const docsShell = read('src/components/docs/StreamPayDocsShell.tsx')
const docsHome = read('src/components/docs/StreamPayDocsHome.tsx')
const agentDocsPage = read('src/components/docs/StreamPayAgentDocsPage.tsx')
const signInLanding = read('src/components/agreements/AgreementSignInLanding.tsx')
const sessionSplashOverlay = read('src/components/HashPayStreamSessionSplash.tsx')
const sessionSplash = read('src/lib/useHashPayStreamSessionSplash.ts')
const envExample = read('.env.example')
const indexHtml = read('index.html')
const renderBlueprint = read('render.yaml')
const readinessMonitor = read('.github/workflows/production-readiness.yml')
const recoveryAudit = read('scripts/database-recovery-audit.mjs')
const recoveryRunbook = read('docs/database-recovery.md')
const packageLock = JSON.parse(read('package-lock.json'))

assert.match(server, /app\.get\('\/healthz'/)
assert.match(server, /app\.get\('\/readyz'/)
assert.match(server, /createHashPayStreamReadinessHandler\(\{ isDraining: \(\) => draining \}\)/)
assert.match(server, /process\.once\('SIGTERM'/)
assert.match(server, /process\.once\('SIGINT'/)
assert.match(gracefulShutdown, /closeIdleConnections/)
assert.match(gracefulShutdown, /closeAllConnections/)
assert.match(server, /app\.use\('\/api\/hashpaystream'[\s\S]*Cache-Control'[\s\S]*no-store/)
assert.match(server, /app\.use\('\/api\/hashpaystream', apiTelemetry\)/)
assert.match(agentAuth, /logSecurity\(withHashPayStreamRequestId\(event\)\)/)
assert.match(agreementGateway, /logError\(withHashPayStreamRequestId\(/)
assert.match(arcWebhook, /logEvent\(withHashPayStreamRequestId\(event\)\)/)
assert.match(server, /app\.get\('\/api\/hashpaystream\/v2\/agreements'/)
assert.match(server, /app\.post\('\/api\/hashpaystream\/v2\/agreements'/)
assert.match(server, /app\.get\('\/api\/hashpaystream\/v1\/agent\/agreements'/)
assert.match(server, /app\.post\('\/api\/hashpaystream\/v1\/agent\/agreements'/)
assert.match(server, /app\.get\(\s*'\/api\/hashpaystream\/v1\/admin\/analytics'/)
assert.match(server, /app\.all\('\/api\/hashpaystream\/v1\/admin\/analytics'/)
assert.match(server, /app\.get\(\s*'\/api\/hashpaystream\/v1\/public\/stats'/)
assert.match(server, /app\.all\('\/api\/hashpaystream\/v1\/public\/stats'/)
assert.match(adminAnalytics, /HASHPAYSTREAM_ADMIN_EMAILS/)
assert.match(adminAnalytics, /privy\.users\(\)\._get\(userId\)/)
assert.match(adminAnalytics, /api\/v2\/agreements\?limit=100/)
assert.match(adminAnalytics, /No identities, wallet addresses, private URLs, agreement IDs, or transaction hashes/)
assert.match(publicStats, /public, max-age=60, s-maxage=300/)
assert.match(publicStats, /No identities, wallets, private links, agreement identifiers, transaction hashes/)
assert.doesNotMatch(publicStats, /payerReviewPath|recipient|transactionHash/)
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
assert.match(app, /route === '\/docs\/architecture'/)
assert.match(app, /route === '\/docs\/agents'/)
assert.match(app, /route === '\/home'/)
assert.match(app, /route === '\/activity'/)
assert.match(app, /route === '\/account'/)
assert.match(app, /route === '\/admin\/analytics'/)
assert.match(app, /route === '\/stats'/)
assert.match(app, /route === '\/terms'/)
assert.match(app, /route === '\/privacy'/)
assert.match(app, /route === '\/agreements'/)
assert.match(app, /route === '\/agreements\/new'/)
assert.match(app, /route === '\/upfront'/)
assert.match(app, /UPFRONT_ENABLED \? <StreamPayUpfront \/> : <Navigate to="\/home" replace \/>/)
assert.match(app, /<Navigate to="\/" replace\s*\/>/)
assert.match(app, /const AUTH_DECISION_ROUTES = new Set\(\['\/', '\/home', '\/agreements', '\/agreements\/new', '\/upfront', '\/activity', '\/account', '\/admin\/analytics'\]\)/)
assert.match(upfrontPage, /this screen does not move funds/i)
assert.match(upfrontPage, /Describe the work before asking the payer to fund it/i)
assert.match(upfrontPage, /Check before funding/)
assert.match(upfrontPage, /template: 'fixed_unlock'/)
assert.doesNotMatch(upfrontPage, /Funded agreement|useAgreements/)
assert.match(envExample, /VITE_HASHPAYSTREAM_UPFRONT_ENABLED=false/)
assert.match(app, /const \{ ready \} = usePrivy\(\)/)
assert.match(app, /const splashState = useHashPayStreamSessionSplash\(authDecisionRoute, ready\)/)
assert.match(app, /const SESSION_READY_TIMEOUT_MS = 12_000/)
assert.match(app, /window\.setTimeout\(\(\) => setSessionDelayed\(true\), SESSION_READY_TIMEOUT_MS\)/)
assert.match(app, /Taking longer than expected/)
assert.match(app, /Check your connection and try again\./)
assert.match(app, /window\.location\.reload\(\)/)
assert.match(app, /<ArrowPathIcon className=\{'h-4 w-4 animate-spin/)
assert.match(
  app,
  /<SessionLoadingSurface sessionDelayed=\{false\} onRetry=\{retrySession\} \/>[\s\S]*<HashPayStreamSessionSplash/,
  'The existing neutral loading surface must remain beneath the fading mobile splash.',
)
assert.ok(
  app.indexOf(`if (splashState !== 'idle')`)
    < app.indexOf('if (!ready && authDecisionRoute)'),
  'The mobile transition must finish before the Privy session result can render.',
)
assert.ok(
  app.indexOf('if (!ready && authDecisionRoute)')
    < app.indexOf(`if (route === '/')`),
  'Privy readiness must resolve before authentication-sensitive routes can render.',
)
assert.match(form, /\/api\/hashpaystream\/v2\/agreements/)
assert.match(dashboard, /\/api\/hashpaystream\/v2\/agreements/)
assert.match(dashboard, /\['fixed_unlock', 'progressive_release', 'milestone'\]/)
assert.match(dashboard, /!supportsReleaseRequests\(active\.template\)/)
assert.match(dashboard, /active\.status === 'active' && supportsReleaseRequests\(active\.template\)/)
assert.match(dashboard, /function releaseRequestForCurrentStep\(agreement\?: Agreement\)/)
assert.match(dashboard, /request\.step === \(agreement\.chain\?\.nextStep \?\? 0\)/)
assert.match(dashboard, /const currentReleaseRequest = releaseRequestForCurrentStep\(active\)/)
assert.match(dashboard, /<AgreementSignInLanding splashState=\{splashState\}\s*\/>/)
assert.match(analyticsDashboard, /@heroicons\/react\/24\/outline/)
assert.match(analyticsDashboard, /\/api\/hashpaystream\/v1\/admin\/analytics/)
assert.match(analyticsDashboard, /Arc Testnet|environment/)
assert.doesNotMatch(analyticsDashboard, /0x[a-fA-F0-9]{40}/)
assert.match(statsPage, /@heroicons\/react\/24\/outline/)
assert.match(statsPage, /\/api\/hashpaystream\/v1\/public\/stats/)
assert.match(statsPage, /Arc Testnet|environment/)
assert.doesNotMatch(statsPage, /0x[a-fA-F0-9]{40}/)
assert.match(signInLanding, /to="\/stats"/)
assert.match(signInLanding, /HashPay<span className="text-blue-500">Stream<\/span>/)
assert.match(signInLanding, /Continue with email/)
assert.match(signInLanding, /Your protected payments\./)
assert.match(signInLanding, /Powered by Arc/)
assert.match(signInLanding, /motion-reduce:hidden/)
assert.match(sessionSplashOverlay, /motion-reduce:hidden md:hidden/)
assert.match(app, /sessionDelayed=\{sessionDelayed\}/)
assert.match(sessionSplashOverlay, /Taking longer than expected/)
assert.match(sessionSplash, /window\.sessionStorage/)
assert.match(sessionSplash, /prefers-reduced-motion: reduce/)
assert.match(sessionSplash, /'holding'/)
assert.match(sessionSplash, /state !== 'holding' \|\| !canLaunch/)
assert.doesNotMatch(form + dashboard, /\/api\/hashpaystream\/arc-agreements/)
assert.match(dashboard, /`\$\{HASH_PAYLINK_ORIGIN\}\/agreements\/\$\{active\.id\}`/)
assert.match(unifiedReceipt, /View on Arc Explorer/)
assert.match(receiptPdf, /https:\/\/testnet\.arcscan\.app/)
assert.match(receiptPdf, /\/Subtype \/Link/)
assert.match(receiptPdf, /\/S \/URI/)
assert.match(receiptPdf, /\^0x\[a-fA-F0-9\]\{64\}\$/)
assert.match(receiptPdf, /hashpaystream-agreement-receipt-/)
assert.match(receiptPdf, /HASHPAYSTREAM \| POWERED BY HASH PAYLINK/)
assert.match(unifiedReceipt, /HashPayStream agreement receipt/)
assert.equal(docsShell.includes('RectangleGroupIcon'), false)
assert.equal(docsShell.includes("path: '/docs/architecture'"), false)
assert.ok(app.includes(`route === '/docs/architecture') content = <Navigate to="/docs#how-it-works" replace />`))
assert.equal(app.includes('StreamPayArchitectureDocs'), false)
assert.ok(docsHome.includes('id="how-it-works"'))
assert.ok(docsHome.includes("hash !== '#how-it-works'"))
assert.ok(docsHome.includes("scrollIntoView({ block: 'start' })"))
assert.ok(docsHome.includes('How we operate'))
assert.ok(docsHome.includes('How HashPayStream works'))
assert.ok(docsHome.includes('powered exclusively by Hash PayLink APIs'))
assert.ok(docsHome.includes('Verified operating example'))
assert.ok(docsHome.includes('Arc Testnet agreement completed end to end.'))
assert.ok(docsHome.includes('0x710c37a00a32df67b3b954309ea51530550e614f6282f968aa79abd44b28fa2b'))
assert.ok(docsHome.includes('not evidence of mainnet volume'))
assert.ok(docsHome.includes("from '@heroicons/react/24/outline'"))
assert.match(agentDocsPage, /<StreamPayAgentDocs embedded \/>/)

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
  'HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER',
]) {
  assert.equal(browserSource.includes(forbidden), false, `Browser source contains forbidden server secret name: ${forbidden}`)
}
const viteNames = [...browserSource.matchAll(/VITE_[A-Z0-9_]+/g)].map(match => match[0])
assert.deepEqual([...new Set(viteNames)].sort(), ['VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS', 'VITE_HASHPAYSTREAM_UPFRONT_ENABLED', 'VITE_HASH_PAYLINK_BASE_URL', 'VITE_PRIVY_APP_ID'])
assert.doesNotMatch(browserSource, /from ['"]lucide-react['"]/)
assert.match(browserSource, /from ['"]@heroicons\/react\/24\/outline['"]/)
assert.doesNotMatch(browserSource, /hashpaylink\.com\/docs\/(terms|privacy)/)
assert.match(browserSource, /new URL\('\/terms', window\.location\.origin\)/)
assert.match(browserSource, /new URL\('\/privacy', window\.location\.origin\)/)
assert.match(browserSource, /\/api\/hashpaystream\/v1\/agent\/agreements/)
assert.doesNotMatch(browserSource, /hps_agent_test_[A-Za-z0-9_-]{32,}/)
assert.match(indexHtml, /href="\/brand\/hashpaystream-mark\.png"/)
assert.match(renderBlueprint, /healthCheckPath: \/readyz/)
assert.match(renderBlueprint, /maxShutdownDelaySeconds: 30/)
assert.match(readinessMonitor, /cron: '3-58\/5 \* \* \* \*'/)
assert.match(readinessMonitor, /https:\/\/hashpaystream\.app\/readyz/)
assert.match(readinessMonitor, /Production readiness failed three consecutive probes\./)
assert.match(recoveryAudit, /begin transaction read only/)
assert.match(recoveryAudit, /unexpectedStoreCount/)
assert.doesNotMatch(recoveryAudit, /console\.log\([^\n]*(?:store_key|row\.value)/)
assert.match(recoveryRunbook, /Never test a restore against production\./)
assert.match(recoveryRunbook, /verifying that no service references it/)

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
  'HASHPAYSTREAM_AGENT_ARC_API_KEY',
  'HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET',
  'HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER',
]) {
  assert.match(envExample, new RegExp(`(?:^|\\n)${serverOnly}=`))
  assert.equal(envExample.includes(`VITE_${serverOnly}=`), false)
}

for (const agentSetting of [
  'HASHPAYSTREAM_AGENT_ARC_API_KEY',
  'HASHPAYSTREAM_AGENT_ARC_PROJECT_ID',
  'HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET',
  'HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY',
  'HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER',
  'HASHPAYSTREAM_AGENT_CREDENTIAL_STORE_KEY',
]) {
  assert.match(envExample, new RegExp('(?:^|\\n)' + agentSetting + '='))
  assert.match(renderBlueprint, new RegExp('- key: ' + agentSetting + '(?:\\n|\\r\\n)'))
  assert.equal(envExample.includes('VITE_' + agentSetting + '='), false)
}

for (const retiredAgentSetting of [
  'HASHPAYSTREAM_AGENT_ID',
  'HASHPAYSTREAM_AGENT_API_KEY',
]) {
  assert.doesNotMatch(envExample, new RegExp('(?:^|\\n)' + retiredAgentSetting + '='))
  assert.doesNotMatch(renderBlueprint, new RegExp('- key: ' + retiredAgentSetting + '(?:\\n|\\r\\n)'))
  assert.equal(runtimeSource.includes(retiredAgentSetting), false)
}

const packageEntries = Object.entries(packageLock.packages ?? {})
assert.equal(packageEntries.some(([, value]) => value?.link === true), false)
assert.equal(JSON.stringify(packageLock).includes('polymarket-lp-sentinel'), false)
assert.equal(JSON.stringify(packageLock).includes('hashkey-paylink'), false)
assert.equal(JSON.stringify(packageLock).includes('node_modules/react-router'), false)
assert.doesNotMatch(browserSource, /from ['"]react-router(?:-dom)?['"]/)

console.log('HashPayStream standalone route and browser-secret smoke checks passed.')
