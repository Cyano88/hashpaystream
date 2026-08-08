import { useEffect } from 'react'
import { ArrowDownIcon, ArrowRightIcon, ArrowTopRightOnSquareIcon, CheckBadgeIcon, CircleStackIcon, CloudIcon, CodeBracketSquareIcon, CpuChipIcon, DocumentCheckIcon, ShieldCheckIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { Link, useLocation } from '../../lib/router'
import { DocsCallout, DocsEyebrow, StreamPayDocsShell } from './StreamPayDocsShell'

const useCases = [
  { Icon: DocumentCheckIcon, title: 'One release', body: 'Protect the full USDC amount and release it after one final delivery is reviewed.' },
  { Icon: CircleStackIcon, title: 'Progress releases', body: 'Divide payment into predetermined percentage checkpoints that end at 100%.' },
  { Icon: CheckBadgeIcon, title: 'Named milestones', body: 'Define two to five deliverables whose whole-number shares total exactly 100%.' },
  { Icon: CpuChipIcon, title: 'Agent agreements', body: 'Create, execute, record and reconcile bounded actions from an invited agent backend.' },
  { Icon: CodeBracketSquareIcon, title: 'x402 planning', body: 'Buy a deterministic fixed-agreement plan from the Circle Agent Marketplace endpoint.' },
  { Icon: ShieldCheckIcon, title: 'Verified lifecycle', body: 'Track confirmed activation, release, completion, cancellation and refund events.' },
]

const operatingLayers = [
  { Icon: UserGroupIcon, eyebrow: 'People and agents', title: 'HashPayStream clients', body: 'Creators, payers and invited agent backends use HashPayStream interfaces and credentials.' },
  { Icon: DocumentCheckIcon, eyebrow: 'Standalone application', title: 'HashPayStream', body: 'Owns the product experience, identity mapping, agreement ownership, agent access and documentation.' },
  { Icon: CodeBracketSquareIcon, eyebrow: 'Exclusive API provider', title: 'Hash PayLink APIs', body: 'Provide agreement creation, policy, prepared chain actions, lifecycle reconciliation, signed webhooks and authoritative receipts.' },
  { Icon: CircleStackIcon, eyebrow: 'Settlement infrastructure', title: 'Circle and Arc', body: 'Provide compatible wallet infrastructure, USDC payment capabilities and confirmed Arc transaction state.' },
]

export default function StreamPayDocsHome() {
  const { hash } = useLocation()

  useEffect(() => {
    if (hash !== '#how-it-works') return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('how-it-works')?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hash])

  return <StreamPayDocsShell active="/docs"><article>
    <DocsEyebrow>Standalone documentation</DocsEyebrow>
    <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">Protected USDC agreements for people and agents.</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">HashPayStream is the standalone agreements experience powered exclusively by Hash PayLink APIs. It separates agreement terms, wallet-authorized funding, delivery review, and confirmed Arc lifecycle records.</p>
    <div className="mt-9 grid gap-3 sm:grid-cols-2">{useCases.map(({ Icon, title, body }) => <div key={title} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]"><Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" /><h2 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">{title}</h2><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p></div>)}</div>
    <section id="how-it-works" className="mt-12 scroll-mt-24">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">How we operate</p>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-gray-950 dark:text-white">How HashPayStream works</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">One standalone experience coordinates the people, agent and payment journey while one upstream API boundary remains authoritative for agreement infrastructure.</p>
      <div className="mt-6">
        {operatingLayers.map(({ Icon, eyebrow, title, body }, index) => (
          <div key={title}>
            <div className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:grid-cols-[44px_150px_1fr] sm:items-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><Icon className="h-5 w-5" /></span>
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{eyebrow}</p><h3 className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{title}</h3></div>
              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p>
            </div>
            {index < operatingLayers.length - 1 && <div className="flex h-9 items-center pl-4 sm:justify-center sm:pl-0"><ArrowDownIcon className="h-4 w-4 text-blue-500" /></div>}
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]">
          <CloudIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">HashPayStream owns</h3>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">The standalone domain, product UI, identity and ownership mapping, agent access, customer activity, documentation and support surface.</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]">
          <ShieldCheckIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">Hash PayLink APIs provide</h3>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">Agreement policy, prepared Arc actions, lifecycle controls, reconciliation, signed webhooks and authoritative receipt data.</p>
        </div>
      </div>
      <DocsCallout title="One source of agreement truth" tone="blue">HashPayStream does not treat a browser redirect, message or local database update as proof of funding or release. Confirmed Hash PayLink and Arc lifecycle state remains authoritative.</DocsCallout>
    </section>
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Agreement lifecycle</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">{[
        ['01', 'Define', 'Set the work, recipient, amount and release structure.'],
        ['02', 'Fund', 'The payer reviews and authorizes Arc escrow funding.'],
        ['03', 'Deliver', 'Submit a delivery note and HTTPS evidence.'],
        ['04', 'Resolve', 'Approve, revise, cancel or refund only when eligible.'],
      ].map(([number, title, body]) => <div key={number} className="border-t border-gray-200 pt-4 dark:border-white/10"><p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">{number}</p><p className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{title}</p><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p></div>)}</div>
    </section>
    <section id="verified-operation" className="mt-12 scroll-mt-24">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Verified operating example</p>
      <div className="mt-3 rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><CheckBadgeIcon className="h-5 w-5" /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Arc Testnet agreement completed end to end.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">On 8 August 2026, HashPayStream created and reconciled a fixed agreement funded with 0.1 test USDC. The creator submitted HTTPS delivery evidence, the payer approved the release, and Arc confirmed the full transfer from escrow to the configured recipient.</p>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {[
            ['Agreement', 'agr_927c646e183c4681b925ff2e', 'Fixed · one release'],
            ['Outcome', '0.1 USDC released', '0 USDC remaining'],
            ['Arc confirmation', 'Block 55,953,829', 'Success · 8 Aug 2026'],
          ].map(([label, value, detail]) => <div key={label} className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{label}</p><p className="mt-2 break-all text-xs font-semibold text-gray-950 dark:text-white">{value}</p><p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{detail}</p></div>)}
        </div>
        <div className="mt-6 flex flex-col gap-4 border-t border-gray-200 pt-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-[11px] leading-5 text-gray-500 dark:text-gray-400">This is a testnet operating verification. It is not evidence of mainnet volume, customer adoption or investment performance.</p>
          <a href="https://testnet.arcscan.app/tx/0x710c37a00a32df67b3b954309ea51530550e614f6282f968aa79abd44b28fa2b" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">View verified Arc transaction <ArrowTopRightOnSquareIcon className="h-4 w-4" /></a>
        </div>
      </div>
    </section>
    <DocsCallout title="Two payments must not be confused" tone="amber">Circle Marketplace's $0.01 x402 payment pays only for the planning response. The agreement's stated USDC amount is separate and requires a later wallet-authorized escrow action through an approved pilot integration.</DocsCallout>
    <section className="mt-12 grid gap-4 sm:grid-cols-2">
      <Link to="/docs/arc-agreements" className="group rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950"><DocumentCheckIcon className="h-6 w-6 text-blue-400 dark:text-blue-600" /><h2 className="mt-5 text-lg font-semibold">Arc agreement guide</h2><p className="mt-2 text-xs leading-5 text-gray-300 dark:text-gray-600">Roles, structures, delivery, lifecycle and safety boundaries.</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold">Read guide <ArrowRightIcon className="h-4 w-4" /></span></Link>
      <Link to="/docs/circle-marketplace" className="group rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b]"><CodeBracketSquareIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" /><h2 className="mt-5 text-lg font-semibold text-gray-950 dark:text-white">Circle x402 endpoint</h2><p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">Request schema, payment sequence, response and OpenAPI file.</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-gray-950 dark:text-white">Open reference <ArrowRightIcon className="h-4 w-4" /></span></Link>
    </section>
  </article></StreamPayDocsShell>
}
