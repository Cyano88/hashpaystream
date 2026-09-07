import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
export type ThemePreference = Theme | 'system'
type Surface = 'launch' | 'auth'
interface ThemeContextValue {
  theme: Theme
  preference: ThemePreference
  setPreference: (value: ThemePreference) => void
  toggle: () => void
  registerSurface: (id: string, surface?: Surface) => void
}
const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', preference: 'system', setPreference: () => {}, toggle: () => {}, registerSurface: () => {} })
function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem('hp_theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* Storage is optional. */ }
  return 'system'
}
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>(readPreference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [surfaces, setSurfaces] = useState<Record<string, Surface>>({})
  const theme: Theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
  const active = Object.values(surfaces)
  const surface = active.includes('launch') ? 'launch' : active.includes('auth') ? 'auth' : 'app'
  const effective: Theme = surface === 'launch' ? 'dark' : surface === 'auth' ? 'light' : theme
  const registerSurface = useCallback((id: string, value?: Surface) => {
    setSurfaces(previous => {
      if (previous[id] === value) return previous
      const next = { ...previous }
      if (value) next[id] = value
      else delete next[id]
      return next
    })
  }, [])
  const setPreference = useCallback((value: ThemePreference) => {
    if (!['system', 'light', 'dark'].includes(value)) return
    updatePreference(value)
    try { localStorage.setItem('hp_theme', value) } catch { /* Keep the in-memory preference. */ }
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    const storage = (event: StorageEvent) => { if (event.key === 'hp_theme' || event.key === null) updatePreference(readPreference()) }
    media.addEventListener('change', update)
    window.addEventListener('storage', storage)
    update()
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', storage) }
  }, [])
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', effective === 'dark')
    root.style.colorScheme = effective
    root.dataset.streamSystemSurface = effective
    root.dataset.streamThemeSurface = surface
    delete root.dataset.streamBoot
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface === 'launch' ? '#06070a' : effective === 'dark' ? '#0A0A0A' : '#F5F5F7')
  }, [effective, surface])
  return <ThemeContext.Provider value={{ theme, preference, setPreference, toggle: () => setPreference(theme === 'light' ? 'dark' : 'light'), registerSurface }}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)
export function useThemeSurface(surface: Surface, enabled = true) {
  const id = useId()
  const { registerSurface } = useTheme()
  useLayoutEffect(() => {
    if (!enabled) return
    registerSurface(id, surface)
    return () => registerSurface(id)
  }, [enabled, id, registerSurface, surface])
}
