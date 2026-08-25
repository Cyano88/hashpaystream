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
  const { pathname } = useLocation()
  const route = pathname.replace(/\/+$/, '')

  return (
    <nav aria-label="App navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200/80 bg-white/95 px-3 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-[#111113]/95">
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${destinations.length}, minmax(0, 1fr))` }}>
        {destinations.map(({ path, label, Icon }) => <MobileDestination key={path} path={path} label={label} active={
          path === '/home' ? ['/home', '/agreements/new', '/upfront', '/send', '/receive', '/notifications', '/activity'].includes(route)
            : path === '/account' ? ['/account', '/funding'].includes(route)
            : route === path
        } Icon={Icon} />)}
      </div>
    </nav>
  )
}

function MobileDestination({ path, label, active, Icon }: { path: string; label: string; active: boolean; Icon: typeof HomeIcon }) {
  const to = useStreamPayPath(path)
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-all active:scale-[.97] ${active ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950' : 'text-gray-400 dark:text-gray-500'}`}>
      <Icon className={`h-5 w-5 ${active ? 'stroke-[2.25]' : ''}`} />
      <span>{label}</span>
    </Link>
  )
}
