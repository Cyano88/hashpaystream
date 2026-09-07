import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createHash, randomUUID } from 'node:crypto'

export async function checkedDirectory(directory) {
  if (!directory || !path.isAbsolute(directory)) throw Error('BACKUP_DIRECTORY_REQUIRED')
  const real = await fs.realpath(directory)
  if (!(await fs.stat(real)).isDirectory()) throw Error('BACKUP_DIRECTORY_REQUIRED')
  for (let current = real; ; current = path.dirname(current)) {
    const marker = path.join(current, '.git')
    const stat = await fs.stat(marker).catch(() => undefined)
    const repository = stat?.isFile() || (stat?.isDirectory() && await fs.stat(path.join(marker, 'HEAD')).then(() => true, () => false))
    if (repository) throw Error('BACKUP_DIRECTORY_IN_REPOSITORY')
    if (path.dirname(current) === current) break
  }
  return real
}

export function toolEnvironment(env = process.env) {
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF'])
  return Object.fromEntries(Object.entries(env).filter(([key]) => allowed.has(key.toUpperCase())))
}

export function command(file, args, env) {
  const child = spawn(file, args, { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(Error('BACKUP_PROCESS_FAILED')))
    child.once('close', code => code === 0 ? resolve() : reject(Error('BACKUP_PROCESS_FAILED')))
  })
  // Attach a handler immediately; callers still await the original rejection.
  done.catch(() => {})
  return { child, done }
}

export async function checksum(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

// Only encrypted bytes reach disk. Neither command's stderr is logged.
export async function encryptCommand({ source, age, recipient, directory, timeoutMs = 600000 }) {
  if (!/^age1[0-9a-z]{58}$/.test(recipient ?? '')) throw Error('AGE_PUBLIC_RECIPIENT_REQUIRED')
  const root = await checkedDirectory(directory)
  const name = 'trade-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.dump.age'
  const partial = path.join(root, name + '.partial')
  const final = path.join(root, name)
  let producer, cipher, output, timeout, linked = false
  const jobs = []
  try {
    // Exclusive creation prevents overwriting an existing backup or following a symlink.
    const handle = await fs.open(partial, 'wx', 0o600)
    output = handle.createWriteStream()
    cipher = command(age, ['--encrypt', '--recipient', recipient], toolEnvironment())
    producer = command(source.file, source.args, source.env)
    producer.child.stdin.end()
    const abort = () => { producer.child.kill(); cipher.child.kill(); output.destroy() }
    timeout = setTimeout(abort, timeoutMs)
    jobs.push(producer.done, cipher.done,
      pipeline(producer.child.stdout, cipher.child.stdin),
      pipeline(cipher.child.stdout, output))
    try { await Promise.all(jobs) } catch { abort(); throw Error('ENCRYPTED_EXPORT_FAILED') }
    const durable = await fs.open(partial, 'r+')
    try { await durable.sync() } finally { await durable.close() }
    const sha256 = await checksum(partial)
    // Hard link publication fails if a destination already exists.
    await fs.link(partial, final)
    linked = true
    await fs.unlink(partial)
    await fs.writeFile(final + '.sha256', sha256 + '  ' + name + '\n', { flag: 'wx', mode: 0o600 })
    return { file: final, sha256, bytes: (await fs.stat(final)).size }
  } catch {
    if (producer) producer.child.kill()
    if (cipher) cipher.child.kill()
    if (output) output.destroy()
    await Promise.allSettled(jobs)
    await fs.unlink(partial).catch(() => {})
    if (linked) {
      await fs.unlink(final).catch(() => {})
      await fs.unlink(final + '.sha256').catch(() => {})
    }
    throw Error('ENCRYPTED_EXPORT_FAILED')
  } finally { clearTimeout(timeout) }
}
