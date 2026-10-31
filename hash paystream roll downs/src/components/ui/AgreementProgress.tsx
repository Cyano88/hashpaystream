import { CheckIcon } from '@heroicons/react/24/solid'

export type AgreementProgressStep = { label: string; detail?: string }

export function AgreementProgress({ steps, current }: { steps: AgreementProgressStep[]; current: number }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Agreement progress">
      {steps.map((step, index) => {
        const number = index + 1
        const complete = number < current
        const active = number === current
        return (
          <li key={step.label} aria-current={active ? 'step' : undefined} className={`rounded-2xl border p-3.5 ${active ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-400/10' : complete ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10' : 'border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.035]'}`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${active ? 'bg-blue-600 text-white' : complete ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
              {complete ? <CheckIcon className="h-4 w-4" /> : number}
            </span>
            <p className="mt-2 text-xs font-bold text-gray-950 dark:text-white">{step.label}</p>
            {step.detail && <p className="mt-1 text-[10px] leading-4 text-gray-500 dark:text-gray-400">{step.detail}</p>}
          </li>
        )
      })}
    </ol>
  )
}
