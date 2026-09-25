import HostedAccountConnection from './HostedAccountConnection'
import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeftIcon, CheckIcon, ClipboardDocumentIcon, ChevronRightIcon, ChartBarIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useCircleWallet } from '../lib/circleWallet'
import { useStreamAccount } from '../lib/streamAccount'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import type { WalletReceiveDetails } from '../lib/readStockBalances'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

export default function StreamPayReceive() {
  const { authenticated, user, getAccessToken } = usePrivy()
  const account = useStreamAccount()
  const wallet = useCircleWallet()
  const [rail, setRail] = useState<'arc' | 'xlayer' | null>(null)
  const [copied, setCopied] = useState('')
  const [copyError, setCopyError] = useState('')
  const [revision, setRevision] = useState(0)
  const [arc, setArc] = useState<{scope:string;receive?:WalletReceiveDetails;error?:string;needsConnection?:boolean}>()
  const receiveAddress = rail === 'xlayer' ? 'connected' : wallet.address
  const scope = (user?.id || '') + ':' + rail + ':' + receiveAddress.toLowerCase()
  const homeTo = useStreamPayPath('/home')
  useEffect(() => {
    setCopied('');setCopyError('')
    if (!rail || !authenticated) return
    let active = true
    const timer = window.setTimeout(() => { if(active){setArc({scope,error:'Receiving details took too long. Try again.'});active=false} },20000)
    const load = async () => {
      if (rail === 'arc') return wallet.receiveDetails()
      const token = await getAccessToken()
      if (!active || !token) throw Error('Sign in again.')
      const response = await fetchWithTimeout('/api/hashpaystream/v1/stocks/receive', {method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({source:'connected'})})
      const data = await response.json()
      if (data.needsConnection) throw Object.assign(Error('Connect your Hash PayLink account.'),{needsConnection:true})
      const receive = data.receive as WalletReceiveDetails | undefined
      if (!response.ok || !data.ok || !receive || receive.chainId !== 196 || data.walletSource !== 'connected' || !/^0x[a-fA-F0-9]{40}$/.test(data.wallet || '') || receive.address.toLowerCase() !== data.wallet.toLowerCase() || receive.qrValue !== receive.address) throw Error('Receiving details did not match this wallet.')
      return receive
    }
    void load().then(receive => {if(active)setArc({scope,receive})}).catch(error => {if(active)setArc({scope,error:'Receiving details are unavailable. Try again.',needsConnection:!!error?.needsConnection})}).finally(()=>window.clearTimeout(timer))
    return () => {active=false;window.clearTimeout(timer)}
  },[rail,scope,authenticated,wallet.receiveDetails,revision,getAccessToken])
  useEffect(()=>{setCopied('');setCopyError('')},[rail,user?.id])
  if (!authenticated) return <AgreementSignInLanding />
  const receive = arc?.scope === scope ? arc.receive : undefined
  const error = arc?.scope === scope ? arc.error : ''
  const busy = !receive && !error
  async function copy(value: string, key: string) {
    if (!value) return
    try { await navigator.clipboard.writeText(value);setCopied(key);setCopyError('') }
    catch {setCopyError('Could not copy. You can select the address below.')}
  }
  return <section className="stream-screen w-full max-w-md py-5 sm:py-8">
    <header className="grid grid-cols-[44px_1fr_44px] items-center">
      {rail ? <button type="button" aria-label="Back to receive options" className="stream-icon-button" onClick={()=>setRail(null)}><ArrowLeftIcon className="h-4 w-4" /></button> : <Link to={homeTo} aria-label="Back home" className="stream-icon-button"><ArrowLeftIcon className="h-4 w-4" /></Link>}
      <h1 className="text-center text-lg font-extrabold">{rail ? rail === 'arc' ? 'Receive USDC' : 'Receive xStocks' : 'Receive'}</h1>
    </header>
    {!rail ? <div className="mt-5 space-y-3">
      <ReceiveChoice title="USDC" detail="Arc" Icon={CurrencyDollarIcon} onClick={()=>setRail('arc')} />
      <ReceiveChoice title="xStocks" detail="X Layer" Icon={ChartBarIcon} onClick={()=>setRail('xlayer')} />
    </div> : arc?.scope === scope && arc.needsConnection ? <div className="mt-5"><HostedAccountConnection/><button className="min-h-11 text-xs underline" onClick={()=>setRevision(n=>n+1)}>Continue after connecting</button></div> : <div className="mt-5 space-y-3">
      {rail === 'arc' && <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
        <button type="button" disabled={!account.profile?.pocketId} onClick={()=>void copy(account.profile?.pocketId || '', 'id')} className="flex min-h-11 w-full items-center gap-3 text-left disabled:cursor-default">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-xs font-bold dark:bg-white/[0.07]">ID</span>
          <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Pocket ID</span>{account.profile?.pocketId ? <span className="mt-1 block text-sm font-bold tabular-nums">{account.profile.pocketId}</span> : account.loading ? <span aria-label="Loading Pocket ID" className="mt-2 block h-4 w-24 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-white/10" /> : <span className="text-xs text-gray-400">Unavailable</span>}</span>
          {copied === 'id' ? <CheckIcon className="h-5 w-5 text-emerald-500" /> : <ClipboardDocumentIcon className="h-5 w-5 text-gray-400" />}
        </button>
        <p className="mt-2 text-[11px] leading-5 text-gray-400">Receive from another Hash PayStream account.</p>
      </div>}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
        {receive ? <><div className="mx-auto w-fit rounded-[24px] bg-white p-4"><QRCodeSVG value={receive.qrValue} size={164} level="M" title={'Receive on '+receive.networkName} /></div>
          <button type="button" onClick={()=>void copy(receive.address,'address')} className="mt-3 flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left"><span className="min-w-0 flex-1 select-text break-all font-mono text-xs leading-5">{receive.address}</span>{copied === 'address' ? <CheckIcon className="h-5 w-5 shrink-0 text-emerald-500" /> : <ClipboardDocumentIcon className="h-5 w-5 shrink-0 text-gray-400" />}</button>
          <p className="mt-2 text-[11px] leading-5 text-gray-400">{receive.depositNotice}</p><p className="text-[11px] leading-5 text-gray-400">{receive.gasNotice}</p>
        </> : busy ? <div role="status" aria-label="Loading receiving wallet" className="space-y-4"><div className="mx-auto h-[196px] w-[196px] animate-pulse rounded-2xl bg-gray-100 motion-reduce:animate-none dark:bg-white/10" /><div className="mx-auto h-3 w-4/5 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-white/10" /></div> : <><p role="status" className="text-xs text-gray-400">{error || 'Receiving details are unavailable.'}</p><button type="button" onClick={()=>setRevision(value=>value+1)} className="mt-3 min-h-11 text-xs font-semibold underline">Try again</button></>}
      </div>
      {(copyError || account.error) && <p role="status" className="px-3 text-center text-xs text-gray-400">{copyError || account.error}</p>}
    </div>}
  </section>
}
function ReceiveChoice({title,detail,Icon,onClick}:{title:string;detail:string;Icon:typeof ChartBarIcon;onClick:()=>void}) {
  return <button type="button" onClick={onClick} className="flex min-h-[82px] w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.07]"><Icon className="h-5 w-5" strokeWidth={1.6} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-[11px] text-gray-400">{detail}</span></span><ChevronRightIcon className="h-4 w-4 text-gray-400" /></button>
}
