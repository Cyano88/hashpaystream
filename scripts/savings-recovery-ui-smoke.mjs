import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import * as viem from 'viem'
const source=fs.readFileSync('src/components/savings/SavingsDepositSheet.tsx','utf8').replace(/\r\n/g,'\n').replace(/^import .*\n/gm,'')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const owner='0x1111111111111111111111111111111111111111',vault='0x2222222222222222222222222222222222222222',asset='0x3333333333333333333333333333333333333333'
let checks=0,walletCalls=0
const prior={hash:'0x'+'a'.repeat(64),intent:{action:'withdraw',planId:'0x'+'b'.repeat(64),amount:'100000'}}
const context={SavingsTransactionError:class extends Error {},exports:{},React,...React,...viem,CheckIcon:()=>null,savingsChain:{id:5042002},SAVINGS_USDC_ADDRESS:asset,WEEKLY_SECONDS:604800,MONTHLY_SECONDS:2592000,SAVINGS_VAULT_ABI:[],formatUsdcBalance:()=>'',savingsPlanPreview:()=>undefined,
 createPublicClient:()=>({waitForTransactionReceipt:async()=>{checks++;return {}}}),createWalletClient:()=>{walletCalls++;throw Error('No wallet writes allowed')},readSavingsTransaction:()=>prior,
 runSavingsTransaction:async(_scope,intent,_submit,wait)=>{await wait(prior.hash);return intent},
 document:{body:{style:{overflow:''}},activeElement:null},window:{requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener(){},removeEventListener(){}}}
vm.runInNewContext(compiled,context)
const savings={address:owner,vaultAddress:vault,hasPendingTransaction:true,depositsEnabled:false,wallet:undefined,refresh:async()=>{throw Error('balance refresh offline')},refreshSavings:async()=>{}}
let root
await act(async()=>{root=TestRenderer.create(React.createElement(context.exports.default,{savings,onClose(){}}))})
const button=root.root.findAllByType('button').find(b=>b.children.includes('Check transaction'))
assert.ok(button,'Pending receipt must be recoverable while deposits are paused and fields are empty')
assert.equal(button.props.disabled,false)
await act(async()=>button.props.onClick())
assert.equal(checks,1);assert.equal(walletCalls,0)
assert.ok(JSON.stringify(root.toJSON()).includes('Savings transaction confirmed'),'A confirmed withdrawal must not be labelled as a newly created plan')
assert.ok(!JSON.stringify(root.toJSON()).includes('Savings plan created'))
await act(async()=>root.unmount())
console.log('Paused savings recovery UI, no-resubmit behavior and refresh-failure confirmation checks passed.')
