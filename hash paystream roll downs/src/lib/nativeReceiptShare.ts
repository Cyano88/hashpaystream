import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

const CACHE_FOLDER = 'receipt-exports'
const MAX_CACHE_AGE = 24 * 60 * 60_000

export async function shareNativeReceipt(file: File): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (!['application/pdf', 'image/jpeg'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Receipt file is not supported.')
  // Keep newly shared files until the receiving app can read them. Clean old
  // exports on the next share; Android also owns eviction of this cache.
  const old = await Filesystem.readdir({ path: CACHE_FOLDER, directory: Directory.Cache }).catch(() => ({ files: [] }))
  for (const entry of old.files) {
    if (entry.type === 'file' && /^[a-zA-Z0-9_.-]+$/.test(entry.name) && Date.now() - entry.mtime > MAX_CACHE_AGE) {
      await Filesystem.deleteFile({ path: `${CACHE_FOLDER}/${entry.name}`, directory: Directory.Cache }).catch(() => undefined)
    }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  const name = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(-140) || (file.type === 'application/pdf' ? 'receipt.pdf' : 'receipt.jpg')
  const result = await Filesystem.writeFile({ path: `${CACHE_FOLDER}/${crypto.randomUUID()}-${name}`, data: btoa(binary), directory: Directory.Cache, recursive: true })
  await Share.share({ title: 'HashPayStream receipt', dialogTitle: 'Share receipt', files: [result.uri] })
  return true
}
