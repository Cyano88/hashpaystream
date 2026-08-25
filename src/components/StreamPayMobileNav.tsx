import { BanknotesIcon, DocumentTextIcon, HomeIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { Link, useLocation } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

const destinations = [
  { path: '/home', label: 'Home', Icon: HomeIcon },
  { path: '/agreements', label: 'Agreements', Icon: DocumentTextIcon },
  { path: '/funding', label: 'Funding', Icon: BanknotesIcon },
  { path: '/account', label: 'Account', Icon: UserCircleIcon },
]

export function StreamPayMobileNav() {
  const { pathname } = useLocation()
  const route = pathname.replace(/\/+$/, '')

  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200/80 bg-white/95 px-3 pb-[max(.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#111113]/95 md:hidden">
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${destinations.length}, minmax(0, 1fr))` }}>
        {destinations.map(({ path, label, Icon }) => <MobileDestination key={path} path={path} label={label} active={path === '/agreements' ? route.startsWith('/agreements') : route === path} Icon={Icon} />)}
      </div>
    </nav>
  )
}

function MobileDestination({ path, label, active, Icon }: { path: string; label: string; active: boolean; Icon: typeof HomeIcon }) {
  const to = useStreamPayPath(path)
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
      <Icon className={`h-5 w-5 ${active ? 'stroke-[2.25]' : ''}`} />
      <span>{label}</span>
    </Link>
  )
}
