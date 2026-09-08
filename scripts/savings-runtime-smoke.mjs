import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { getAddress, isAddress, zeroAddress } from 'viem'

// Execute the actual hook with deterministic HTTP and timers, without loading wallet providers.
const source = fs.readFileSync('src/lib/useSavingsVault.ts', 'utf8').replace(/\r\n/g, '\n').split('export const SAVINGS_VAULT_ABI')[0]
  .replace(/^import .*\n/gm, '').replace(/^export \{.*\n/gm, '').replace(/import\.meta\.env/g, '({})')
const compiled = ts.transpileModule(source + '\nexport { useSavingsRuntimeConfig }', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const pending = []
const asset = getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061')
const vault = getAddress('0x1111111111111111111111111111111111111111')
const context = { exports: {}, ...React, getAddress, isAddress, zeroAddress, Capacitor: { isNativePlatform: () => false }, upfrontXLayerChain: { id: 196 }, XLAYER_USDC_ADDRESS: asset, AbortController,
  fetch: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  window: { setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} } }
vm.runInNewContext(compiled, context)
let state, root
function Probe() { state = context.exports.useSavingsRuntimeConfig(); return null }
const mount = async () => act(async () => { root = TestRenderer.create(React.createElement(Probe)) })
const unmount = async () => act(async () => root.unmount())
const success = async () => act(async () => pending.shift().resolve({ ok: true, json: async () => ({ ok: true, savings: { chainId: 196, assetAddress: asset, vaultAddress: vault, depositsEnabled: true, status: 'active' } }) }))
await mount()
assert.equal(state.depositsEnabled, false)
await success()
assert.equal(state.depositsEnabled, true)
await unmount()
await mount()
assert.equal(state.depositsEnabled, false, 'Reopening must not reuse cached deposit authorization')
assert.equal(state.configReady, false)
await act(async () => pending.shift().reject(new Error('offline')))
assert.equal(state.depositsEnabled, false)
assert.equal(state.vaultAddress, vault, 'Retain the address for existing-plan reads')
await unmount()
await mount()
assert.equal(state.depositsEnabled, false, 'A failed refresh must not leave an active cache')
await success()
assert.equal(state.depositsEnabled, true, 'Successful verification restores deposits')
await unmount()
await mount()
const stale = pending.shift()
await unmount()
await act(async () => stale.resolve({ok:true,json:async()=>({ok:true,savings:{chainId:196,assetAddress:asset,vaultAddress:'0x2222222222222222222222222222222222222222',depositsEnabled:true,status:'active'}})}))
await mount()
assert.equal(state.vaultAddress, vault, 'An unmounted request must not overwrite the shared cache')
assert.equal(state.depositsEnabled, false)
await unmount()
console.log('Savings runtime remount, offline, recovery and unmount checks passed.')
