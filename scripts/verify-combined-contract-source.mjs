import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('contracts/audits/combined-20260906/IMPORTED_FILES.json', root), 'utf8'))
assert.equal(manifest.files.length, 15)
for (const file of manifest.files) {
  assert.match(file.path, /^(src|test)\/[A-Za-z0-9_./-]+$/)
  assert.ok(!file.path.includes('..'))
  const normalized = readFileSync(new URL(`contracts/${file.path}`, root), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  assert.equal(createHash('sha256').update(normalized).digest('hex'), file.normalizedSha256, file.path)
}
console.log('All 15 imported contract source/test files match the frozen combined audit package (UTF-8/LF normalized).')
