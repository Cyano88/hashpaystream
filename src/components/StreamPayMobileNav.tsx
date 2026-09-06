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
    <nav aria-label="App navigation" className="fixed inset-x-4 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-full border border-zinc-200/80 bg-white/90 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.16)] backdrop-blur-xl dark:border-[#262626] dark:bg-[#111]/92 dark:shadow-2xl">
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${destinations.length}, minmax(0, 1fr))` }}>
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
    <Link to={to} aria-current={active ? 'page' : undefined} className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-full text-[10px] font-bold transition-all active:scale-[.97] ${active ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950' : 'text-zinc-400 dark:text-zinc-500'}`}>
      <Icon className={`h-5 w-5 ${active ? 'stroke-[2.25]' : ''}`} />
      <span>{label}</span>
    </Link>
  )
}
