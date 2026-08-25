import { Link, useLocation } from '../lib/router'
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { usePrivy } from '@privy-io/react-auth'
import { useTheme } from '../lib/ThemeContext'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { HashPayStreamMark } from './HashPayStreamMark'

function isTelegramStreamPay(search: string) {
  const params = new URLSearchParams(search)
  const source = (params.get('src') ?? '').toLowerCase()
  return source === 'telegram'
}

export function StreamPayHeader() {
  const { pathname, search } = useLocation()
  const { authenticated } = usePrivy()
  const { theme, toggle } = useTheme()

  const agreementsTo = useStreamPayPath(authenticated ? '/home' : '/')
  const homeTo = useStreamPayPath('/home')
  const workspaceTo = useStreamPayPath('/agreements')
  const fundingTo = useStreamPayPath('/funding')
  const accountTo = useStreamPayPath('/account')
  const docsTo = useStreamPayPath('/docs')
  const telegramMode = isTelegramStreamPay(search)
  const route = pathname.replace(/\/+$/, '') || '/'
  const minimalSignInHeader = route === '/agreements' && !authenticated
  const navClass = (path: string) => {
    const active = path === '/agreements' ? route.startsWith('/agreements') : route === path
    return `rounded-full px-3 py-2 text-xs font-medium transition-colors ${active
      ? 'bg-gray-100 text-gray-950 dark:bg-white/10 dark:text-white'
      : 'text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'}`
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 dark:border-white/5 bg-white/80 dark:bg-[#111113]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-3 pb-2 sm:px-6">
        <Link to={agreementsTo} className="group flex items-center gap-2.5 focus:outline-none" aria-label="HashPayStream home">
          <HashPayStreamMark className="h-6 w-6 text-gray-900 transition-transform group-hover:scale-105 dark:text-white" />
          <span className="text-[15px] font-semibold tracking-tight">
            <span className="text-gray-900 dark:text-white">HashPay</span><span style={{ color: '#3b82f6' }}>Stream</span>
          </span>
        </Link>

        <div className="flex items-center gap-x-1.5 sm:gap-x-2">
          {minimalSignInHeader && !telegramMode && (
            <Link to={docsTo} className="rounded-full px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
              Docs
            </Link>
          )}
          {authenticated && !telegramMode && (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
              <Link to={homeTo} aria-current={route === '/home' ? 'page' : undefined} className={navClass('/home')}>
                Home
              </Link>
              <Link to={workspaceTo} aria-current={route.startsWith('/agreements') ? 'page' : undefined} className={navClass('/agreements')}>
                Agreements
              </Link>
              <Link to={fundingTo} aria-current={route === '/funding' ? 'page' : undefined} className={navClass('/funding')}>
                Funding
              </Link>
              <Link to={accountTo} aria-current={route === '/account' ? 'page' : undefined} className={navClass('/account')}>
                Account
              </Link>
            </nav>
          )}
          <button
            type="button"
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] text-gray-500 dark:text-gray-400 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}
