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
const agreementHome = read('src/components/StreamPayHome.tsx')
const requestsPage = read('src/components/StreamPayRequests.tsx')
const requestFundingPage = read('src/components/StreamPayFundRequest.tsx')
const serviceRequestsApi = read('api/service-requests.ts')
const agreementsHook = read('src/lib/useAgreements.ts')
assert.match(agreementHome, /Total balance/)
assert.match(agreementHome, /customerEscrow/)
assert.match(agreementHome, /request\.role !== 'customer'/)
assert.match(agreementHome, /availableBalance \+ customerEscrow\.protected \+ customerEscrow\.refundable/)
assert.match(agreementHome, /Refundable/)
assert.match(agreementHome, /grid grid-cols-4/)
assert.match(agreementHome, /Early pay/)
assert.match(agreementHome, /\/requests\?compose=1/)
assert.match(app, /<Navigate to="\/requests\?compose=1" replace/)
assert.match(requestsPage, /Service provider email/)
assert.match(requestsPage, /providerEmail/)
assert.match(requestsPage, /item\.status === 'sent'/)
assert.match(requestsPage, /role === 'provider' \? 'Waiting for customer' : 'New terms proposed'/)
assert.match(requestsPage, /value: '3600', label: '1 hour'/)
assert.match(requestsPage, /<StreamPayFundRequest/)
assert.doesNotMatch(requestsPage, /CHECKOUT_ORIGIN/)
assert.match(requestFundingPage, /payer_link_wallet/)
assert.match(requestFundingPage, /payer_recover/)
assert.match(requestFundingPage, /review\?\.recovery\?\.pending/)
assert.match(requestFundingPage, /Approve USDC - Step 1 of 2/)
assert.match(requestFundingPage, /Fund and start - Step 2 of 2/)
assert.match(requestFundingPage, /Confirming on Arc\.\.\./)
assert.match(requestFundingPage, /payer_lifecycle_challenge/)
assert.match(requestFundingPage, /Return remaining USDC/)
assert.match(serviceRequestsApi, /agreement\.expired/)
assert.match(serviceRequestsApi, /left\.createdAt\.localeCompare\(right\.createdAt\)/)
assert.match(requestsPage, /expired: 'Refund available'/)
assert.match(requestsPage, /const fundingItem = useMemo/)
assert.match(requestFundingPage, /USDC returned to your Circle wallet/)
assert.match(requestFundingPage, /review\.lifecycle\.action\.status === 'confirmed'/)
assert.match(agreementHome, /label: 'Send'/)
assert.match(agreementHome, /label: 'Deposit'/)
assert.doesNotMatch(agreementHome, /label: 'Manage'/)
assert.match(agreementHome, /Recent activity/)
assert.match(agreementHome, /Your latest agreement updates/)
assert.match(agreementHome, /.slice\(0, 3\)/)
assert.match(agreementHome, /Array\.isArray\(agreement\.timeline\)/)
assert.match(agreementsHook, /function safeUnits\(value: unknown\)/)
assert.match(agreementsHook, /Array\.isArray\(data\.agreements\)/)
const dashboard = read('src/components/agreements/AgreementDashboard.tsx')
const analyticsDashboard = read('src/components/admin/StreamPayAnalytics.tsx')
const statsPage = read('src/components/StreamPayStats.tsx')
const upfrontPage = read('src/components/StreamPayUpfront.tsx')
assert.match(upfrontPage, /X Layer payout address/)
assert.match(upfrontPage, /Advance amount/)
assert.doesNotMatch(upfrontPage, /FixedAgreementForm/)
assert.match(upfrontPage, /Open requests/)
const fundingDesk = read('src/components/StreamPayFundingDesk.tsx')
const fundingPage = read('src/components/StreamPayFunding.tsx')
const mobileNav = read('src/components/StreamPayMobileNav.tsx')
const layout = read('src/components/StreamPayLayout.tsx')
const sendPage = read('src/components/StreamPaySend.tsx')
const receivePage = read('src/components/StreamPayReceive.tsx')
const activityPage = read('src/components/StreamPayActivity.tsx')
const accountPage = read('src/components/StreamPayAccount.tsx')
const accountApi = read('api/stream-accounts.ts')
const legalPage = read('src/components/StreamPayLegal.tsx')
const upfrontLocalE2e = read('scripts/upfront-local-e2e.mjs')
const treasuryWallet = read('src/components/UpfrontTreasuryWallet.tsx')
const upfrontFundButton = read('src/components/UpfrontFundButton.tsx')
const upfrontLifecycleButton = read('src/components/UpfrontLifecycleButton.tsx')
const unifiedReceipt = read('src/components/UnifiedReceipt.tsx')
const receiptPdf = read('src/lib/paymentReceiptPdf.ts')
const docsShell = read('src/components/docs/StreamPayDocsShell.tsx')
const docsHome = read('src/components/docs/StreamPayDocsHome.tsx')
const agentDocsPage = read('src/components/docs/StreamPayAgentDocsPage.tsx')
const signInLanding = read('src/components/agreements/AgreementSignInLanding.tsx')
const emailLogin = read('src/components/auth/StreamPayEmailLogin.tsx')
const circleWalletGate = read('src/components/CircleWalletGate.tsx')
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
assert.match(server, /app\.get\('\/assets\/\*'[\s\S]*status\(404\)/)
assert.match(server, /app\.get\('\*'[\s\S]*Cache-Control'[\s\S]*no-store/)
assert.match(main, /vite:preloadError/)
assert.match(main, /window\.location\.reload\(\)/)
assert.match(server, /app\.use\('\/api\/hashpaystream', apiTelemetry\)/)
assert.match(agentAuth, /logSecurity\(withHashPayStreamRequestId\(event\)\)/)
assert.match(agreementGateway, /logError\(withHashPayStreamRequestId\(/)
assert.match(arcWebhook, /logEvent\(withHashPayStreamRequestId\(event\)\)/)
assert.match(server, /app\.get\('\/api\/hashpaystream\/v1\/human\/agreements'/)
assert.match(server, /app\.post\('\/api\/hashpaystream\/v1\/human\/agreements'/)
assert.match(server, /app\.get\('\/api\/hashpaystream\/v1\/human\/upfront\/agreements'/)
assert.match(server, /app\.get\('\/api\/hashpaystream\/v1\/agent\/agreements'/)
assert.match(server, /app\.post\('\/api\/hashpaystream\/v1\/agent\/agreements'/)
assert.match(server, /app\.get\(\s*'\/api\/hashpaystream\/v1\/admin\/analytics'/)
assert.match(server, /app\.all\('\/api\/hashpaystream\/v1\/admin\/analytics'/)
assert.match(server, /app\.get\(\s*'\/api\/hashpaystream\/v1\/public\/stats'/)
assert.match(server, /app\.all\('\/api\/hashpaystream\/v1\/public\/stats'/)
assert.match(adminAnalytics, /HASHPAYSTREAM_ADMIN_EMAILS/)
assert.match(adminAnalytics, /privy\.users\(\)\._get\(userId\)/)
assert.match(adminAnalytics, /HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY/)
assert.match(adminAnalytics, /HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY/)
assert.match(adminAnalytics, /HASHPAYSTREAM_AGENT_AGREEMENT_STORE_KEY/)
assert.match(adminAnalytics, /duplicated across human and agent stores/)
assert.match(adminAnalytics, /HASHPAYSTREAM_UPFRONT_ARC_API_KEY/)
assert.match(adminAnalytics, /agreementIds\.join/)
assert.doesNotMatch(adminAnalytics, /api\/v2\/agreements\?limit=100/)
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
assert.match(server, /app\.all\('\/api\/hashpaystream\/v1\/human\/agreements'/)
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
assert.match(app, /route === '\/operations'/)
assert.match(app, /route === '\/admin\/analytics'/)
assert.match(app, /route === '\/stats'/)
assert.match(app, /route === '\/terms'/)
assert.match(app, /route === '\/privacy'/)
assert.match(app, /route === '\/agreements'/)
assert.match(app, /route === '\/agreements\/new'/)
assert.match(app, /route === '\/upfront'/)
assert.match(app, /route === '\/upfront\/funding'/)
assert.match(app, /route === '\/funding'/)
assert.match(app, /route === '\/upfront'\) content = <StreamPayUpfront \/>/)
assert.match(app, /<Navigate to="\/" replace\s*\/>/)
assert.match(app, /'\/send', '\/receive', '\/activity'/)
assert.match(app, /route === '\/send'/)
assert.match(app, /route === '\/receive'/)
assert.match(upfrontPage, /Funded agreement/)
assert.match(upfrontPage, /Check early pay/)
assert.match(upfrontPage, /template: 'fixed_unlock'/)
assert.match(upfrontPage, /agreementId,/)
assert.doesNotMatch(upfrontPage, /Funder sign-in|Use another creator email|AgreementProgress/)
assert.match(upfrontLocalE2e, /\[1952, 196\]\.includes\(expectedChainId\)/)
assert.match(upfrontLocalE2e, /chainId, expectedChainId/)
assert.match(fundingPage, /Apply with your HashPayStream account/)
assert.match(fundingPage, /Apply to be a funding partner/)
assert.match(fundingPage, /StreamSelect/)
assert.match(fundingPage, /Submit for team review/)
assert.match(fundingPage, /No separate funder sign-in is required/)
assert.match(fundingPage, /KYC will be required before live-money access/)
assert.match(fundingPage, /profile\?\.status === 'approved'/)
assert.match(mobileNav, /Home/)
assert.match(mobileNav, /Agreements/)
assert.match(mobileNav, /Requests/)
assert.match(mobileNav, /Account/)
assert.doesNotMatch(mobileNav, /label: 'Funding'/)
assert.doesNotMatch(mobileNav, /md:hidden/)
assert.match(layout, /!mobileAppPage && <StreamPayHeader/)
assert.match(sendPage, /resolvePocketId/)
assert.match(sendPage, /sendUsdc/)
assert.match(sendPage, /recordTransfer/)
assert.match(receivePage, /Pocket ID/)
assert.match(receivePage, /Wallet address/)
assert.match(activityPage, /wallet\.sent/)
assert.match(activityPage, /agreement\.activated/)
assert.match(accountPage, /Appearance/)
assert.match(accountPage, /Funding partners/)
assert.match(accountApi, /decodeFunctionData/)
assert.match(accountApi, /getAddress\(chain\.from\)/)
assert.doesNotMatch(accountApi, /recipient.*email/)
assert.doesNotMatch(fundingDesk, /Use another email|approved funder identity/)
assert.match(fundingDesk, /Funding marketplace/)
assert.match(fundingDesk, /Every advance requires explicit confirmation from the approved treasury wallet/)
assert.match(fundingDesk, /Demo network notice/)
assert.match(fundingDesk, /Arc Testnet USDC, which has no financial value/)
assert.match(fundingDesk, /if \(!response\.ok\)[^\n]+\n\s+setAuthorized\(true\)/)
assert.match(fundingDesk, /authorized && \(upfrontTreasuryEnabled \? <UpfrontTreasuryWallet/)
assert.match(treasuryWallet, /embeddedWallets\.length === 1/)
assert.match(fundingDesk, /<UpfrontFundButton opportunity=\{item\}/)
assert.match(upfrontFundButton, /allowedFunders/)
assert.doesNotMatch(upfrontFundButton, /maxAdvanceAmount|maxTotalFunded|totalFunded/)
assert.match(upfrontFundButton, /requested advance exceeds the signed PolyDesk limit/)
assert.match(upfrontFundButton, /Approve exactly \$\{amountLabel\}/)
assert.match(upfrontFundButton, /getBalance\(\{ address: account \}\)/)
assert.match(upfrontFundButton, /getGasPrice\(\)/)
assert.match(upfrontFundButton, /displayed payout address does not match the signed underwriting offer/)
assert.match(upfrontFundButton, /gasPrice \* 600_000n/)
assert.match(upfrontFundButton, /functionName: 'fundAdvance'/)
assert.match(upfrontFundButton, /VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS/)
assert.match(upfrontFundButton, /args: \[offer\.message, amount, account, offer\.signature\]/)
assert.doesNotMatch(upfrontFundButton, /REPAYMENT_RECIPIENT/)
assert.match(upfrontLifecycleButton, /releaseAdvance/)
assert.match(upfrontLifecycleButton, /creditRepayment/)
assert.match(upfrontLifecycleButton, /functionName: 'claim'/)
assert.match(upfrontLifecycleButton, /address\(raw\.repaymentRecipient, 'Repayment wallet'\) !== account/)
assert.match(fundingDesk, /<UpfrontLifecycleButton/)
const fundingPartnerReview = read('src/components/admin/FundingPartnerReviewPanel.tsx')
const adminAnalyticsSurface = read('src/components/admin/StreamPayAnalytics.tsx')
assert.match(adminAnalyticsSurface, /<FundingPartnerReviewPanel/)
assert.match(adminAnalyticsSurface, /href="#funding-partners"/)
assert.match(fundingPartnerReview, /\?review=1/)
assert.match(fundingPartnerReview, /action:\s*["']review["']/)
assert.match(fundingPartnerReview, /Approval grants access to review the private marketplace/)
assert.match(fundingPartnerReview, /escrow owner[\s\S]*separate wallet[\s\S]*allowlist/)
assert.match(treasuryWallet, /knownTreasuries\.length > 1/)
assert.match(treasuryWallet, /user\?\.linkedAccounts/)
assert.match(treasuryWallet, /setWalletCheckTimedOut\(true\), 8000/)
assert.match(treasuryWallet, /transactions remain locked/)
assert.match(treasuryWallet, /navigator\.clipboard\.writeText\(treasury\)/)
assert.match(envExample, /VITE_HASHPAYSTREAM_UPFRONT_ENABLED=false/)
assert.match(app, /const \{ ready, authenticated \} = usePrivy\(\)/)
assert.doesNotMatch(treasuryWallet, /gas-free/)
assert.match(treasuryWallet, /small OKB gas balance/)
assert.match(treasuryWallet, /small Arc Testnet USDC gas balance/)
assert.match(treasuryWallet, /Funding and repayment address/)
assert.match(treasuryWallet, /receives its repayments on Arc/)
assert.match(legalPage, /Arc test funds must not be treated as real collateral/)
assert.match(legalPage, /sent to ZeroScout and PolyDesk for assessment and underwriting/)
assert.match(legalPage, /Circle asks you to verify the same email/)
assert.match(legalPage, /Last updated 24 August 2026/)
assert.match(app, /const splashState = useHashPayStreamSessionSplash\(authDecisionRoute, ready\)/)
assert.match(signInLanding, /aria-label="Powered by Hash PayLink"/)
assert.match(signInLanding, /\/brand\/hashpaylink-mark-dark\.png/)
assert.doesNotMatch(signInLanding, /Powered by Arc/)
assert.match(app, /const SESSION_READY_TIMEOUT_MS = 12_000/)
assert.match(app, /window\.setTimeout\(\(\) => setSessionDelayed\(true\), SESSION_READY_TIMEOUT_MS\)/)
assert.match(app, /Taking longer than expected/)
assert.match(app, /Check your connection and try again\./)
assert.match(app, /window\.location\.reload\(\)/)
assert.match(app, /<LoadingRing className="h-4 w-4/)
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
assert.match(dashboard, /\/api\/hashpaystream\/v1\/human\/agreements/)
assert.match(dashboard, /\['fixed_unlock', 'progressive_release', 'milestone'\]/)
assert.match(dashboard, /!supportsReleaseRequests\(active\.template\)/)
assert.match(dashboard, /active\.status === 'active' && supportsReleaseRequests\(active\.template\)/)
assert.match(dashboard, /function releaseRequestForCurrentStep\(agreement\?: Agreement\)/)
assert.match(dashboard, /request\.step === \(agreement\.chain\?\.nextStep \?\? 0\)/)
assert.match(dashboard, /const currentReleaseRequest = releaseRequestForCurrentStep\(active\)/)
assert.match(dashboard, /<AgreementSignInLanding splashState=\{splashState\}\s*\/>/)
assert.match(dashboard, /Ongoing/)
assert.match(dashboard, /Completed/)
assert.doesNotMatch(dashboard, /Needs action/)
assert.match(dashboard, /No agreements in this section/)
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
assert.match(signInLanding, /<StreamPayEmailLogin/)
assert.match(emailLogin, /Continue with email/)
assert.match(emailLogin, /aria-label="Secured by Privy"/)
assert.match(emailLogin, /src="\/privy-mark-logo\.png"/)
assert.doesNotMatch(emailLogin, /uppercase tracking-\[0\.16em\] text-blue-600">HashPayStream/)
assert.match(circleWalletGate, /ArrowLeftIcon/)
assert.match(circleWalletGate, /aria-label="Back to email sign in"/)
assert.match(circleWalletGate, /await logout\(\)/)
assert.match(circleWalletGate, /clearStoredCircleSession\(window\.localStorage\)/)
assert.match(circleWalletGate, /window\.location\.replace\('\/'\)/)
assert.match(circleWalletGate, /const RETRY_DELAY_MS = 10_000/)
assert.match(circleWalletGate, /Taking longer than expected\?/)
assert.match(circleWalletGate, />Try again<\/button>/)
assert.match(circleWalletGate, /z-\[160\]/)
assert.doesNotMatch(receivePage, /Available balance/)
assert.doesNotMatch(activityPage, /Transfers, agreements, delivery and releases in one place\./)
assert.match(signInLanding, /Your protected payments\./)
assert.match(signInLanding, /motion-reduce:hidden/)
assert.match(sessionSplashOverlay, /motion-reduce:hidden md:hidden/)
assert.match(app, /sessionDelayed=\{sessionDelayed\}/)
assert.match(sessionSplashOverlay, /Taking longer than expected/)
assert.match(sessionSplash, /window\.sessionStorage/)
assert.match(sessionSplash, /prefers-reduced-motion: reduce/)
assert.match(sessionSplash, /'holding'/)
assert.match(sessionSplash, /state !== 'holding' \|\| !canLaunch/)
assert.doesNotMatch(dashboard, /\/api\/hashpaystream\/arc-agreements/)
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
assert.ok(docsHome.includes('Hash PayLink APIs remain authoritative for agreement infrastructure'))
assert.ok(docsHome.includes('Upfront public test boundary'))
assert.ok(docsHome.includes('requires OKB gas'))
assert.ok(docsHome.includes('ZeroScout, PolyDesk and X Layer'))
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
assert.doesNotMatch(browserSource, /ArrowPathIcon[^\n]*animate-spin|animate-spin[^\n]*ArrowPathIcon/)
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
assert.deepEqual([...new Set(viteNames)].sort(), ['VITE_CIRCLE_USER_WALLET_APP_ID', 'VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET', 'VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS', 'VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID', 'VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS', 'VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED', 'VITE_HASH_PAYLINK_BASE_URL', 'VITE_PRIVY_APP_ID'])
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
for (const publicDeploymentValue of [
  '0x0E47e6dD4f86C5Cf1843Dce310b710FaE64c0C16',
  '0x9065c996672E9FE8f9F13F1DE6c9DF23d4A17D3E',
  '0xB089C3d5F06074856d7665A1Aa53Dc0d761930aE',
  '0xfd23c4697e41Bb6874d72D5f2b56Af8aB00CAb99',
  '0x83Bd6A645cBE8d04b5F33f2c2c87A1d1FDD71D5b',
]) assert.match(renderBlueprint, new RegExp(publicDeploymentValue, 'i'))
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
