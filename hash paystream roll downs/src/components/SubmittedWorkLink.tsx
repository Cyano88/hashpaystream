import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { compactEvidenceReference } from '../lib/stableSnapshots'

export default function SubmittedWorkLink({ href }: { href: string }) {
  if (!href.startsWith('https://')) return null
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="mt-3 flex min-h-10 items-center justify-between rounded-xl bg-gray-50 px-3 text-xs font-bold text-gray-700 dark:bg-white/[0.055] dark:text-gray-200">
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400">Submitted work</span>
        <span className="mt-0.5 block truncate">{compactEvidenceReference(href)}</span>
      </span>
      <ArrowTopRightOnSquareIcon className="ml-3 h-4 w-4 shrink-0" />
    </a>
  )
}
