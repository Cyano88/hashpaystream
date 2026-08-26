import { CheckCircleIcon, DocumentCheckIcon, ShieldCheckIcon, UserCircleIcon, WalletIcon } from '@heroicons/react/24/outline'
import { DocsCallout, DocsEyebrow, StreamPayDocsShell } from './StreamPayDocsShell'

export default function StreamPayArcAgreementDocs() {
  return <StreamPayDocsShell active="/docs/arc-agreements"><article>
    <DocsEyebrow>Arc Testnet agreements</DocsEyebrow>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">Terms, funding and delivery remain separate.</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">An agreement defines how USDC may move. Creating terms does not prove that escrow was funded, and requesting a release does not release funds by itself.</p>
    <div className="mt-9 grid gap-3 sm:grid-cols-3">{[
      { Icon: UserCircleIcon, title: 'Customer', body: 'Creates the job request, chooses the worker, sets the protected amount and funds accepted terms.' },
      { Icon: WalletIcon, title: 'Worker', body: 'Reviews the request, accepts or proposes new terms, then delivers the agreed work.' },
      { Icon: ShieldCheckIcon, title: 'HashPayStream', body: 'Presents the experience and reconciles authoritative Hash PayLink and Arc state.' },
    ].map(({ Icon, title, body }) => <div key={title} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]"><Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" /><h2 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">{title}</h2><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p></div>)}</div>
    <DocsCallout title="Worker email is enforced" tone="blue">The customer sends each private job request to a worker&apos;s email. Only that verified worker can accept, decline or propose new terms. The customer funds the agreement after both sides accept the final terms.</DocsCallout>
    <section className="mt-12"><h2 className="text-xl font-semibold text-gray-950 dark:text-white">Supported release structures</h2><div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#18181b]">{[
      ['fixed_unlock', 'One release', 'The full protected amount becomes eligible after one reviewed delivery.'],
      ['progressive_release', 'Progress releases', 'Predetermined increasing checkpoints end at 100 percent.'],
      ['milestone', 'Named milestones', 'Two to five named deliverables have whole-number shares totaling 100 percent.'],
    ].map(([code, title, body], index) => <div key={code} className={`grid gap-2 px-5 py-5 sm:grid-cols-[160px_1fr] ${index ? 'border-t border-gray-100 dark:border-white/10' : ''}`}><div><code className="text-xs font-semibold text-blue-600 dark:text-blue-400">{code}</code><p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{title}</p></div><p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p></div>)}</div></section>
    <section className="mt-12"><h2 className="text-xl font-semibold text-gray-950 dark:text-white">Confirmed lifecycle</h2><div className="mt-5 space-y-4">{[
      'Draft: terms exist, but no funding is proven.',
      'Active: Arc funding and activation have been confirmed.',
      'Delivery review: evidence is available for the payer to inspect.',
      'Step released or completed: a confirmed release changed the protected balance.',
      'Cancelled, expired or refunded: the terminal state and any returned balance are confirmed.',
    ].map(item => <div key={item} className="flex gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" /><p>{item}</p></div>)}</div></section>
    <section className="mt-12 rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950 sm:p-8"><DocumentCheckIcon className="h-6 w-6 text-blue-400 dark:text-blue-600" /><h2 className="mt-4 text-xl font-semibold">Receipts follow confirmation.</h2><p className="mt-3 text-sm leading-7 text-gray-300 dark:text-gray-600">HashPayStream displays lifecycle receipts only after the relevant Arc transaction is confirmed. Signed lifecycle webhooks are processed idempotently so duplicate delivery cannot create a duplicate state transition.</p></section>
  </article></StreamPayDocsShell>
}
