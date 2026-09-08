const key = (owner: string) => `hashpaystream:arc-activity:${owner.toLowerCase()}`
export function pendingArcActivity(owner: string): string[] {
  const raw = window.localStorage.getItem(key(owner))
  const values = raw ? JSON.parse(raw) : []
  return Array.isArray(values) ? values.filter(value => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)).slice(0,100) : []
}
export function queueArcActivity(owner: string, hash: string) { window.localStorage.setItem(key(owner),JSON.stringify([...new Set([...pendingArcActivity(owner),hash])].slice(-100))) }
export function removeArcActivity(owner: string, hash: string) { window.localStorage.setItem(key(owner),JSON.stringify(pendingArcActivity(owner).filter(value=>value!==hash))) }
