import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'

type Location = {
  pathname: string
  search: string
  hash: string
}

type RouterValue = {
  location: Location
  navigate: (to: string, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterValue | null>(null)

function browserLocation(): Location {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(browserLocation)

  useEffect(() => {
    const update = () => setLocation(browserLocation())
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  const value = useMemo<RouterValue>(() => ({
    location,
    navigate(to, options) {
      const target = new URL(to, window.location.href)
      if (target.origin !== window.location.origin) {
        window.location.assign(target.href)
        return
      }
      const next = `${target.pathname}${target.search}${target.hash}`
      window.history[options?.replace ? 'replaceState' : 'pushState'](null, '', next)
      setLocation(browserLocation())
      window.scrollTo({ top: 0, behavior: 'auto' })
    },
  }), [location])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

function useRouter() {
  const value = useContext(RouterContext)
  if (!value) throw new Error('HashPayStream router is unavailable.')
  return value
}

export function useLocation() {
  return useRouter().location
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const { navigate } = useRouter()
  useEffect(() => navigate(to, { replace }), [navigate, replace, to])
  return null
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string
}

export function Link({ to, onClick, target, ...props }: LinkProps) {
  const { navigate } = useRouter()

  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || target === '_blank'
    ) return
    const destination = new URL(to, window.location.href)
    if (destination.origin !== window.location.origin) return
    event.preventDefault()
    navigate(`${destination.pathname}${destination.search}${destination.hash}`)
  }

  return <a {...props} href={to} target={target} onClick={follow} />
}
