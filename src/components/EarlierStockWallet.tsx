import {usePrivy} from '@privy-io/react-auth'
import {ArrowLeftIcon} from '@heroicons/react/24/outline'
import {Link} from '../lib/router'
import {useStreamPayPath} from '../lib/useStreamPayPath'
import StocksBalanceCard from './StocksBalanceCard'
export default function EarlierStockWallet(){
 const {user}=usePrivy(),account=useStreamPayPath('/account'),send=useStreamPayPath('/move/xlayer/send')
 const wallets=(user?.linkedAccounts||[]).filter(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy'&&a.connectorType==='embedded')
 const address=wallets.length===1&&wallets[0].type==='wallet'?wallets[0].address:''
 return <section className="stream-screen w-full max-w-md space-y-5 py-5 sm:py-8"><header className="flex items-center gap-3"><Link to={account} className="stream-icon-button" aria-label="Back to Account"><ArrowLeftIcon className="h-4 w-4"/></Link><h1 className="text-lg font-extrabold">Earlier stock wallet</h1></header><p className="text-xs leading-5 text-gray-500">This is your original Hash PayStream wallet. Your assets have not been moved. New stock payments use your connected Hash PayLink wallet.</p><StocksBalanceCard legacy/><div className="stream-card space-y-3 p-4"><p className="text-xs font-bold">Earlier X Layer address</p><p className="select-text break-all font-mono text-xs">{address||'Wallet unavailable'}</p><Link to={send} className="flex min-h-11 items-center text-xs font-bold">Send existing X Layer USDC</Link></div></section>
}
