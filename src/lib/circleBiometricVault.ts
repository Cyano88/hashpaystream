// Adapted from Pocket quick approval: biometric-protected random key and AES-GCM session envelope.
// Current Pocket payment PIN verification is separate and is not bypassed or copied here.
import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric'

type Credentials = { username: string; password: string }
type NativeStore = Pick<typeof NativeBiometric, 'isAvailable' | 'isCredentialsSaved' | 'setCredentials' | 'getCredentials' | 'getSecureCredentials' | 'deleteCredentials'>
const PREFIX = 'hashpaystream-circle-biometric-v1:'
const KEY_PREFIX = 'hashpaystream-circle-unlock-key-v1:'
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value))
const buffer = (value: Uint8Array) => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
export function createCircleBiometricVault(native: NativeStore = NativeBiometric) {
  let epoch = 0
  const secrets = new Map<string, Uint8Array>(), operations = new Map<string, Promise<unknown>>()
  function locked<T>(server: string, fn: (started: number) => Promise<T>): Promise<T> {
    const started = epoch
    const next = (operations.get(server) ?? Promise.resolve()).catch(() => undefined).then(() => fn(started))
    operations.set(server, next)
    return next.finally(() => { if (operations.get(server) === next) operations.delete(server) })
  }
  const keyServer = (server: string) => server + '.biometric-key-v1'
  async function protectedKey(server: string) { return (await native.isCredentialsSaved({ server: keyServer(server) })).isSaved }
  async function encrypt(server: string, email: string, raw: string, secret: Uint8Array) {
    const iv = crypto.getRandomValues(new Uint8Array(12)), key = await crypto.subtle.importKey('raw', buffer(secret), 'AES-GCM', false, ['encrypt'])
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: new TextEncoder().encode(server+'\0'+email) }, key, new TextEncoder().encode(raw))
    await native.setCredentials({ server, username: email, password: PREFIX+JSON.stringify({ iv: base64(iv), ciphertext: base64(new Uint8Array(cipher)) }), accessControl: AccessControl.NONE })
    if (!(await native.isCredentialsSaved({ server })).isSaved) throw Error('Your wallet session could not be saved.')
  }
  return {
    available: async () => { const result = await native.isAvailable({ useFallback: false }).catch(() => null); return Boolean(result?.isAvailable && result.strongBiometryIsAvailable) },
    enabled: protectedKey,
    enable: (server: string, email: string, raw: string) => locked(server, async (started) => {
      const result = await native.isAvailable({ useFallback: false })
      if (!result.isAvailable || !result.strongBiometryIsAvailable) throw Error('Fingerprint or face unlock is not available on this phone.')
      if (await protectedKey(server)) throw Error('Biometric unlock is already configured. Unlock your wallet first.')
      const secret = crypto.getRandomValues(new Uint8Array(32))
      await native.setCredentials({ server: keyServer(server), username: email, password: KEY_PREFIX+base64(secret), accessControl: AccessControl.BIOMETRY_CURRENT_SET, title: 'Turn on wallet unlock', negativeButtonText: 'Not now' })
      if (!await protectedKey(server)) throw Error('Your device did not retain the unlock key.')
      // Commit the encrypted envelope only after the device protects the key. Partial enrollment fails closed.
      await encrypt(server, email, raw, secret)
      if (started !== epoch) throw Error('Your wallet was locked. Unlock it again.')
      secrets.set(server, secret)
    }),
    read: (server: string, email: string) => locked(server, async (started): Promise<Credentials | undefined> => {
      if (!(await native.isCredentialsSaved({ server })).isSaved) {
        if (await protectedKey(server)) throw Error('Your saved wallet session needs to be reconnected.')
        return undefined
      }
      const stored = await native.getCredentials({ server })
      if (stored.username !== email) throw Error('The saved wallet belongs to another account.')
      const secured = await protectedKey(server)
      if (!stored.password.startsWith(PREFIX)) {
        if (secured) throw Error('Wallet unlock setup was interrupted. Verify your wallet again.')
        return stored
      }
      if (!secured) throw Error('Wallet unlock needs to be set up again. Verify your wallet.')
      secrets.delete(server)
      // One native prompt; no separate verifyIdentity prompt before reading the protected key.
      const credential = await native.getSecureCredentials({ server: keyServer(server), title: 'Unlock your wallet', reason: 'Use fingerprint or face to open Hash PayStream.', negativeButtonText: 'Cancel' })
      if (credential.username !== email || !credential.password.startsWith(KEY_PREFIX)) throw Error('Wallet unlock does not match this account.')
      const secret = bytes(credential.password.slice(KEY_PREFIX.length))
      if (secret.length !== 32) throw Error('Wallet unlock key is invalid.')
      const envelope = JSON.parse(stored.password.slice(PREFIX.length)) as { iv: string; ciphertext: string }
      const key = await crypto.subtle.importKey('raw', buffer(secret), 'AES-GCM', false, ['decrypt'])
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(bytes(envelope.iv)), additionalData: new TextEncoder().encode(server+'\0'+email) }, key, buffer(bytes(envelope.ciphertext)))
      if (started !== epoch) throw Error('Your wallet was locked. Unlock it again.')
      secrets.set(server, secret)
      return { username: email, password: new TextDecoder().decode(plain) }
    }),
    write: (server: string, email: string, raw: string) => locked(server, async () => {
      const saved = (await native.isCredentialsSaved({ server })).isSaved
      const envelope = saved ? await native.getCredentials({ server }) : undefined
      if (await protectedKey(server) || envelope?.password.startsWith(PREFIX)) {
        const secret = secrets.get(server)
        if (!secret) throw Error('Unlock your wallet before saving its refreshed session.')
        await encrypt(server, email, raw, secret)
      } else {
        await native.setCredentials({ server, username: email, password: raw, accessControl: AccessControl.NONE })
        if (!(await native.isCredentialsSaved({ server })).isSaved) throw Error('Your wallet session could not be saved.')
      }
    }),
    clear: (server: string) => locked(server, async () => {
      secrets.delete(server)
      // Delete the session first; a failed key deletion cannot expose a session or downgrade protection.
      if ((await native.isCredentialsSaved({ server })).isSaved) await native.deleteCredentials({ server })
      if (await protectedKey(server)) await native.deleteCredentials({ server: keyServer(server) })
    }),
    lock: () => { epoch++; secrets.clear() },
  }
}
export const circleBiometricVault = createCircleBiometricVault()
