import assert from 'node:assert/strict'
import {agreementCredentials} from '../api/agreement-credentials.ts'
const draft='hpl_app_'+'a'.repeat(64), funding='hpl_app_'+'b'.repeat(64), sandbox='hpl_test_synthetic'
const live={HASHPAYSTREAM_ARC_ENVIRONMENT:'live',HASHPAYSTREAM_ARC_MAINNET_API_KEY:draft,HASHPAYSTREAM_ARC_MAINNET_FUNDING_API_KEY:funding,HASHPAYSTREAM_ARC_API_KEY:sandbox}
assert.deepEqual(agreementCredentials(live),{draft,funding,recipient:funding})
assert.throws(()=>agreementCredentials({...live,HASHPAYSTREAM_ARC_MAINNET_FUNDING_API_KEY:undefined}))
assert.throws(()=>agreementCredentials({...live,HASHPAYSTREAM_ARC_MAINNET_FUNDING_API_KEY:draft}))
assert.throws(()=>agreementCredentials(live,true))
assert.throws(()=>agreementCredentials({...live,HASHPAYSTREAM_ARC_MAINNET_API_KEY:sandbox}))
assert.deepEqual(agreementCredentials({HASHPAYSTREAM_ARC_API_KEY:sandbox}),{draft:sandbox,funding:sandbox,recipient:sandbox})
console.log('Separate mainnet draft/funding credentials; no fallback, key reuse or legacy upfront on live.')
