import type { ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useLocation } from '../lib/router'
import { StreamPayHeader } from './StreamPayHeader'
import { StreamPayMobileNav } from './StreamPayMobileNav'

export function StreamPayLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { authenticated } = usePrivy()
  const foundationPage = (pathname.replace(/\/+$/, '') || '/') === '/'
  const route = pathname.replace(/\/+$/, '')
  const mobileAppPage = authenticated && ['/home', '/agreements', '/agreements/new', '/upfront', '/funding', '/activity', '/account', '/admin/analytics'].includes(route)

  return (
    <div className="min-h-screen w-full bg-[#F5F5F7] dark:bg-[#111113] font-sans flex flex-col">
      {!foundationPage && <StreamPayHeader />}

      <main className={`flex-1 w-full flex flex-col items-center px-4 md:px-8 ${foundationPage ? 'pb-0' : mobileAppPage ? 'pb-24 md:pb-10' : 'pb-10'}`}>
        {children}
      </main>
      {mobileAppPage && <StreamPayMobileNav />}
    </div>
  )
}
