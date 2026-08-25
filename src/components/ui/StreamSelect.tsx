import { useEffect, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

export type StreamSelectOption = { value: string; label: string }

export function StreamSelect({ value, options, onChange, label, disabled = false, className = 'mt-1.5' }: { value: string; options: StreamSelectOption[]; onChange: (value: string) => void; label: string; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.value === value)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return <div ref={root} className={`relative ${className}`}>
    <button type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 text-left text-sm font-bold text-gray-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
      <span>{selected?.label}</span><ChevronDownIcon className={`h-4 w-4 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,.18)] dark:border-white/10 dark:bg-[#1b1b20]">
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={value === option.value} onClick={() => { onChange(option.value); setOpen(false) }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${value === option.value ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.05]'}`}><span>{option.label}</span>{value === option.value && <CheckIcon className="h-4 w-4" />}</button>)}
    </div>}
  </div>
}
