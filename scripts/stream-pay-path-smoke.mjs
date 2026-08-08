import assert from 'node:assert/strict'
import { streamPayPath } from '../src/lib/useStreamPayPath.ts'

assert.equal(streamPayPath('/home', ''), '/home')
assert.equal(streamPayPath('/home', '?app=mini'), '/home?app=mini')
assert.equal(streamPayPath('/agreements', '?src=telegram'), '/agreements?src=telegram')
assert.equal(streamPayPath('/activity', '?src=Telegram&app=mini'), '/activity?app=mini&src=telegram')
assert.equal(streamPayPath('/account?tab=profile', '?src=telegram'), '/account?tab=profile&src=telegram')
assert.equal(streamPayPath('/home', '?src=untrusted&token=secret'), '/home')

console.log('HashPayStream navigation context smoke checks passed.')
