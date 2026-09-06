import { DocumentTextIcon, HomeIcon, InboxIcon, UserIcon } from '@heroicons/react/24/outline'
import { Link, useLocation } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

const destinations = [
  { path: '/home', label: 'Home', Icon: HomeIcon },
  { path: '/agreements', label: 'Agreements', Icon: DocumentTextIcon },
  { path: '/requests', label: 'Requests', Icon: InboxIcon },
  { path: '/account', label: 'Account', Icon: UserIcon },
]

export function StreamPayMobileNav() {
  const { pathname, search } = useLocation()
  const route = pathname.replace(/\/+$/, '')
  const composingRequest = route === '/requests' && new URLSearchParams(search).get('compose') === '1'

  return (
    <nav aria-label="App navigation" className="stream-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200/80 bg-white shadow-[0_-10px_32px_rgba(0,0,0,.06)] dark:border-[#262626] dark:bg-[#0b0b0b] dark:shadow-[0_-10px_32px_rgba(0,0,0,.28)]">
      <div className="stream-mobile-nav-inner mx-auto grid min-w-0 max-w-md grid-cols-4 px-2 pt-2">
        {destinations.map(({ path, label, Icon }) => <MobileDestination key={path} path={path} label={label} active={
          path === '/home' ? composingRequest || ['/home', '/trade', '/agreements/new', '/upfront', '/funding', '/savings', '/move', '/send', '/receive', '/notifications', '/activity'].includes(route)
            : path === '/account' ? route === '/account'
            : route === path && !composingRequest
        } Icon={Icon} />)}
      </div>
    </nav>
  )
}

function MobileDestination({ path, label, active, Icon }: { path: string; label: string; active: boolean; Icon: typeof HomeIcon }) {
  const to = useStreamPayPath(path)
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden px-1 text-[10px] font-bold transition-colors active:opacity-65 ${active ? 'text-zinc-950 dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}`}>
      <Icon className={`h-[22px] w-[22px] ${active ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  )
}
