import { ArrowRightIcon, CheckBadgeIcon, CircleStackIcon, CodeBracketSquareIcon, CpuChipIcon, DocumentCheckIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { Link } from '../../lib/router'
import { DocsCallout, DocsEyebrow, StreamPayDocsShell } from './StreamPayDocsShell'

const useCases = [
  { Icon: DocumentCheckIcon, title: 'One release', body: 'Protect the full USDC amount and release it after one final delivery is reviewed.' },
  { Icon: CircleStackIcon, title: 'Progress releases', body: 'Divide payment into predetermined percentage checkpoints that end at 100%.' },
  { Icon: CheckBadgeIcon, title: 'Named milestones', body: 'Define two to five deliverables whose whole-number shares total exactly 100%.' },
  { Icon: CpuChipIcon, title: 'Agent agreements', body: 'Create, execute, record and reconcile bounded actions from an invited agent backend.' },
  { Icon: CodeBracketSquareIcon, title: 'x402 planning', body: 'Buy a deterministic fixed-agreement plan from the Circle Agent Marketplace endpoint.' },
  { Icon: ShieldCheckIcon, title: 'Verified lifecycle', body: 'Track confirmed activation, release, completion, cancellation and refund events.' },
]

export default function StreamPayDocsHome() {
  return <StreamPayDocsShell active="/docs"><article>
    <DocsEyebrow>Standalone documentation</DocsEyebrow>
    <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">Protected USDC agreements for people and agents.</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">HashPayStream is the standalone agreements experience powered by Hash PayLink's Arc agreement infrastructure. It separates agreement terms, wallet-authorized funding, delivery review, and confirmed lifecycle records.</p>
    <div className="mt-9 grid gap-3 sm:grid-cols-2">{useCases.map(({ Icon, title, body }) => <div key={title} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]"><Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" /><h2 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">{title}</h2><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p></div>)}</div>
    <section className="mt-12"><h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">How the agreement flow works</h2><div className="mt-6 grid gap-3 sm:grid-cols-4">{[
      ['01', 'Define', 'Set the work, recipient, amount and release structure.'],
      ['02', 'Fund', 'The payer reviews and authorizes Arc escrow funding.'],
      ['03', 'Deliver', 'Submit a delivery note and HTTPS evidence.'],
      ['04', 'Resolve', 'Approve, revise, cancel or refund only when eligible.'],
    ].map(([number, title, body]) => <div key={number} className="border-t border-gray-200 pt-4 dark:border-white/10"><p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">{number}</p><p className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{title}</p><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p></div>)}</div></section>
    <DocsCallout title="Two payments must not be confused" tone="amber">Circle Marketplace's $0.01 x402 payment pays only for the planning response. The agreement's stated USDC amount is separate and requires a later wallet-authorized escrow action through an approved pilot integration.</DocsCallout>
    <section className="mt-12 grid gap-4 sm:grid-cols-2">
      <Link to="/docs/arc-agreements" className="group rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950"><DocumentCheckIcon className="h-6 w-6 text-blue-400 dark:text-blue-600" /><h2 className="mt-5 text-lg font-semibold">Arc agreement guide</h2><p className="mt-2 text-xs leading-5 text-gray-300 dark:text-gray-600">Roles, structures, delivery, lifecycle and safety boundaries.</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold">Read guide <ArrowRightIcon className="h-4 w-4" /></span></Link>
      <Link to="/docs/circle-marketplace" className="group rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b]"><CodeBracketSquareIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" /><h2 className="mt-5 text-lg font-semibold text-gray-950 dark:text-white">Circle x402 endpoint</h2><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">Request schema, payment sequence, response and OpenAPI file.</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-gray-950 dark:text-white">Open reference <ArrowRightIcon className="h-4 w-4" /></span></Link>
    </section>
  </article></StreamPayDocsShell>
}
