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
  const mobileAppPage = (authenticated || route === '/trade') && ['/trade', '/home', '/agreements', '/agreements/new', '/upfront', '/funding', '/savings', '/move', '/send', '/receive', '/activity', '/notifications', '/requests', '/account'].includes(route)

  return (
    <div className={'min-h-screen w-full font-sans flex flex-col ' + (mobileAppPage ? 'bg-[#f6f6f3] text-zinc-950 transition-colors dark:bg-black dark:text-white' : 'bg-[#F5F5F7] dark:bg-[#111113]')}>
      {!foundationPage && !mobileAppPage && <StreamPayHeader />}

      <main className={`flex-1 w-full flex flex-col items-center px-4 ${foundationPage ? 'pb-0' : mobileAppPage ? 'pb-28' : 'pb-10 md:px-8'}`}>
        {children}
      </main>
      {mobileAppPage && authenticated && <StreamPayMobileNav />}
    </div>
  )
}
