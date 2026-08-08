import type { ComponentType, ReactNode, SVGProps } from 'react'
import { ArrowTopRightOnSquareIcon, Bars3Icon, BookOpenIcon, CodeBracketSquareIcon, CpuChipIcon, DocumentCheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Link } from '../../lib/router'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

const navigation: Array<{ label: string; path: string; icon: Icon }> = [
  { label: 'Overview', path: '/docs', icon: BookOpenIcon },
  { label: 'Arc agreements', path: '/docs/arc-agreements', icon: DocumentCheckIcon },
  { label: 'Circle marketplace', path: '/docs/circle-marketplace', icon: CodeBracketSquareIcon },
  { label: 'Agent API', path: '/docs/agents', icon: CpuChipIcon },
]

export function StreamPayDocsShell({ active, children }: { active: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full max-w-6xl py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between lg:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Documentation</p>
        <button type="button" onClick={() => setOpen(value => !value)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 dark:border-white/10 dark:bg-[#18181b] dark:text-gray-300" aria-label="Toggle documentation navigation">
          {open ? <XMarkIcon className="h-4 w-4" /> : <Bars3Icon className="h-4 w-4" />}
        </button>
      </div>
      <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
        <aside className={`${open ? 'block' : 'hidden'} lg:sticky lg:top-24 lg:block lg:self-start`}>
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400 lg:block">HashPayStream docs</p>
          <nav className="mt-3 space-y-1 rounded-2xl border border-gray-200 bg-white p-2 dark:border-white/10 dark:bg-[#18181b] lg:mt-5" aria-label="Documentation">
            {navigation.map(({ label, path, icon: Icon }) => {
              const selected = active === path
              return <Link key={path} to={path} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${selected ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white'}`} aria-current={selected ? 'page' : undefined}><Icon className="h-4 w-4" />{label}</Link>
            })}
          </nav>
          <a href="/openapi/circle-marketplace.openapi.json" target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center gap-2 px-3 text-xs font-semibold text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">OpenAPI 3.1<ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /></a>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}

export function DocsEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">{children}</p>
}

export function DocsCode({ children, language = 'json' }: { children: string; language?: string }) {
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-gray-950 dark:bg-black"><div className="border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">{language}</div><pre className="max-w-full overflow-x-auto p-4 text-[11px] leading-6 text-gray-200 sm:p-5 sm:text-xs"><code>{children}</code></pre></div>
}

export function DocsCallout({ title, children, tone = 'blue' }: { title: string; children: ReactNode; tone?: 'blue' | 'amber' | 'emerald' }) {
  const tones = { blue: 'border-blue-200 bg-blue-50/70 text-blue-950 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100', amber: 'border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100', emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100' }
  return <div className={`mt-8 rounded-2xl border p-5 text-sm leading-6 ${tones[tone]}`}><p className="font-semibold">{title}</p><div className="mt-1 opacity-80">{children}</div></div>
}
