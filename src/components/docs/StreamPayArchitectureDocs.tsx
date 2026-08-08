import {
  ArrowDownIcon,
  CircleStackIcon,
  CloudIcon,
  CodeBracketSquareIcon,
  CpuChipIcon,
  DocumentCheckIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { DocsCallout, DocsEyebrow, StreamPayDocsShell } from './StreamPayDocsShell'

const layers = [
  {
    Icon: UserGroupIcon,
    eyebrow: 'People and agents',
    title: 'HashPayStream clients',
    body: 'Creators, payers and approved agent backends use HashPayStream interfaces and credentials.',
  },
  {
    Icon: DocumentCheckIcon,
    eyebrow: 'Standalone application',
    title: 'HashPayStream',
    body: 'Owns the product experience, identity mapping, agreement ownership, activity presentation, agent access and documentation.',
  },
  {
    Icon: CodeBracketSquareIcon,
    eyebrow: 'Exclusive API provider',
    title: 'Hash PayLink APIs',
    body: 'Provide agreement creation, policy, prepared chain actions, lifecycle reconciliation, signed webhooks and authoritative receipts.',
  },
  {
    Icon: CircleStackIcon,
    eyebrow: 'Settlement infrastructure',
    title: 'Circle and Arc',
    body: 'Provide compatible wallet infrastructure, USDC payment capabilities and confirmed Arc transaction state.',
  },
]

export default function StreamPayArchitectureDocs() {
  return (
    <StreamPayDocsShell active="/docs/architecture">
      <article>
        <DocsEyebrow>Product architecture</DocsEyebrow>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">Standalone experience. Hash PayLink API infrastructure.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">HashPayStream is a standalone protected-USDC agreement application. It uses Hash PayLink APIs exclusively for agreement infrastructure instead of duplicating settlement, policy or lifecycle logic.</p>

        <section className="mt-10" aria-label="HashPayStream architecture flow">
          {layers.map(({ Icon, eyebrow, title, body }, index) => (
            <div key={title}>
              <div className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:grid-cols-[44px_150px_1fr] sm:items-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{eyebrow}</p>
                  <h2 className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{title}</h2>
                </div>
                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p>
              </div>
              {index < layers.length - 1 && <div className="flex h-9 items-center pl-4 sm:justify-center sm:pl-0"><ArrowDownIcon className="h-4 w-4 text-blue-500" /></div>}
            </div>
          ))}
        </section>

        <DocsCallout title="The dependency is deliberate" tone="blue">HashPayStream does not fall back to a second agreement provider or maintain a parallel agreement engine. Hash PayLink is the exclusive upstream API boundary, while HashPayStream remains the standalone customer and agent product.</DocsCallout>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Responsibility boundary</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]">
              <CloudIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">HashPayStream owns</h3>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                <li>Product UI and standalone domain</li>
                <li>User identity and agreement ownership journal</li>
                <li>Agent credential boundary and Circle marketplace service</li>
                <li>Customer activity, documentation and support surface</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]">
              <ShieldCheckIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">Hash PayLink APIs provide</h3>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                <li>Agreement terms and policy validation</li>
                <li>Prepared Arc actions and lifecycle controls</li>
                <li>Chain reconciliation and signed lifecycle webhooks</li>
                <li>Authoritative agreement status and receipt data</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950 sm:p-8">
          <CpuChipIcon className="h-6 w-6 text-blue-400 dark:text-blue-600" />
          <h2 className="mt-4 text-xl font-semibold tracking-tight">One source of agreement truth.</h2>
          <p className="mt-3 text-sm leading-7 text-gray-300 dark:text-gray-600">HashPayStream does not treat a browser redirect, message or local database update as proof of funding or release. Confirmed Hash PayLink and Arc lifecycle state remains authoritative.</p>
        </section>
      </article>
    </StreamPayDocsShell>
  )
}
