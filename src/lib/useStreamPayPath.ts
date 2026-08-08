import { useLocation } from './router'

export function streamPayPath(path: string, search: string) {
  const current = new URLSearchParams(search)
  const context = new URLSearchParams()
  const app = current.get('app')
  const source = (current.get('src') ?? '').toLowerCase()

  if (app) context.set('app', app)
  if (source === 'telegram') context.set('src', 'telegram')

  const query = context.toString()
  if (!query) return path
  return `${path}${path.includes('?') ? '&' : '?'}${query}`
}

export function useStreamPayPath(path: string) {
  const { search } = useLocation()
  return streamPayPath(path, search)
}
