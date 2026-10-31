import type { ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { usePrivy } from '@privy-io/react-auth'
import { useLocation } from '../lib/router'
import { StreamPayHeader } from './StreamPayHeader'
import { StreamPayMobileNav } from './StreamPayMobileNav'

export function StreamPayLayout({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const { authenticated } = usePrivy()
  const foundationPage = (pathname.replace(/\/+$/, '') || '/') === '/'
  const route = pathname.replace(/\/+$/, '')
  const mobileAppPage =
    (authenticated || route === '/trade') &&
    [
      '/home',
      '/trade',
      '/agreements',
      '/agreements/new',
      '/upfront',
      '/funding',
      '/savings',
      '/xstocks',
      '/swap',
      '/move',
      '/move/xlayer/send',
      '/send',
      '/receive',
      '/activity',
      '/notifications',
      '/requests',
      '/account',
    ].includes(route)

  return (
    <div
      data-stream-platform={Capacitor.isNativePlatform() ? 'native' : 'web'}
      data-stream-route={route}
      data-stream-view={new URLSearchParams(search).has('item') ? 'detail' : new URLSearchParams(search).get('view') || 'default'}
      className={
        'min-h-screen w-full font-sans flex flex-col ' + (mobileAppPage ? 'stream-app-shell ' : '') +
        (mobileAppPage
          ? 'min-h-[100dvh] bg-[#f6f6f3] text-zinc-950 transition-colors dark:bg-black dark:text-white'
          : 'bg-[#F5F5F7] dark:bg-[#111113]')
      }
    >
      {!foundationPage && !mobileAppPage && <StreamPayHeader />}
      {mobileAppPage && <div aria-hidden="true" className="stream-status-boundary" />}

      <main
        className={`flex-1 min-h-0 w-full flex flex-col items-center px-4 ${foundationPage ? 'stream-auth-main' : mobileAppPage ? 'stream-mobile-main' : 'pb-10 md:px-8'}`}
      >
        {children}
      </main>
      {mobileAppPage && <StreamPayMobileNav guest={!authenticated} />}
    </div>
  )
}
