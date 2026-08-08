import { ArrowDownTrayIcon, BoltIcon, CheckCircleIcon, CurrencyDollarIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { DocsCallout, DocsCode, DocsEyebrow, StreamPayDocsShell } from './StreamPayDocsShell'

const endpoint = 'https://hashpaystream.app/api/hashpaystream/v1/circle-marketplace/agreement-plan'
const request = `{
  "template": "fixed_unlock",
  "title": "Verified research delivery",
  "description": "Deliver a cited research brief for payer review.",
  "amount": "0.10",
  "recipient": "0x1111111111111111111111111111111111111111",
  "durationSeconds": 86400,
  "cancellationWindowSeconds": 900
}`
const curl = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '${request.replace(/\n/g, '\n  ')}'`

export default function StreamPayCircleMarketplaceDocs() {
  return <StreamPayDocsShell active="/docs/circle-marketplace"><article>
    <DocsEyebrow>Circle Agent Marketplace</DocsEyebrow>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">Fixed Agreement Plan API</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">A paid, deterministic planning service for agents preparing a policy-bound fixed USDC agreement on Arc Testnet.</p>
    <div className="mt-9 grid gap-3 sm:grid-cols-3">{[
      { Icon: CurrencyDollarIcon, title: '$0.01 per request', body: 'The service fee is settled through Circle Gateway x402.' },
      { Icon: BoltIcon, title: 'x402 v2 exact', body: 'A valid unpaid request receives HTTP 402 and PAYMENT-REQUIRED.' },
      { Icon: ShieldCheckIcon, title: 'Planning only', body: 'The response never creates or funds escrow and exposes no payer credential.' },
    ].map(({ Icon, title, body }) => <div key={title} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]"><Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" /><h2 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">{title}</h2><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p></div>)}</div>
    <section className="mt-12"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">POST endpoint</p><p className="mt-2 break-all font-mono text-sm font-semibold text-gray-950 dark:text-white">{endpoint}</p></section>
    <section className="mt-10"><h2 className="text-xl font-semibold text-gray-950 dark:text-white">Request</h2><p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">The complete JSON body is validated before HashPayStream presents a payment requirement.</p><div className="mt-5"><DocsCode>{request}</DocsCode></div></section>
    <section className="mt-10"><h2 className="text-xl font-semibold text-gray-950 dark:text-white">Payment sequence</h2><div className="mt-5 space-y-4">{[
      'Send a valid JSON request without payment credentials.',
      'Receive HTTP 402 with the standard PAYMENT-REQUIRED challenge for Arc Testnet.',
      'Authorize and settle exactly $0.01 USDC using a compatible x402 client.',
      'Repeat the request with the payment proof to receive the deterministic plan.',
    ].map(item => <div key={item} className="flex gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" /><p>{item}</p></div>)}</div></section>
    <DocsCallout title="The agreement amount remains unfunded" tone="amber">The request's amount is the proposed agreement value. It is not the $0.01 service fee and is not transferred by this endpoint. The response directs the agent to an approved HashPayStream pilot integration for separate creation and funding.</DocsCallout>
    <section className="mt-10"><h2 className="text-xl font-semibold text-gray-950 dark:text-white">Unauthenticated example</h2><p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">This example intentionally stops at the 402 challenge. Use your x402 client to satisfy the returned payment requirements.</p><div className="mt-5"><DocsCode language="bash">{curl}</DocsCode></div></section>
    <section className="mt-10"><h2 className="text-xl font-semibold text-gray-950 dark:text-white">Success response</h2><p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">HTTP 200 returns a stable plan id, normalized terms, funding requirements, safeguards, verified payment metadata and the next authorized action. The payer address is intentionally omitted.</p></section>
    <section className="mt-10 grid gap-3 sm:grid-cols-2"><a href="/openapi/circle-marketplace.openapi.json" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 text-sm font-semibold text-gray-950 dark:border-white/10 dark:bg-[#18181b] dark:text-white"><span><span className="block">OpenAPI 3.1 JSON</span><span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">Machine-readable endpoint contract</span></span><ArrowDownTrayIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" /></a><a href="/downloads/hashpaystream-circle-marketplace-endpoint-guide.pdf" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 text-sm font-semibold text-gray-950 dark:border-white/10 dark:bg-[#18181b] dark:text-white"><span><span className="block">Endpoint guide PDF</span><span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">Circle submission artifact</span></span><ArrowDownTrayIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" /></a></section>
  </article></StreamPayDocsShell>
}
