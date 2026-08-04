import type { ReactNode } from 'react'
import { StreamPayHeader } from './StreamPayHeader'

export function StreamPayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-[#111113] font-inter flex flex-col">
      <StreamPayHeader />

      <main className="flex-1 w-full flex flex-col items-center px-4 md:px-8 pb-10">
        {children}
      </main>
    </div>
  )
}
