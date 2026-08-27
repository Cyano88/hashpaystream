import { ArrowDownTrayIcon, ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

export default function StreamPayMove() {
  const homeTo = useStreamPayPath('/home')
  const sendTo = useStreamPayPath('/send')
  const depositTo = useStreamPayPath('/receive')

  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3">
      <Link to={homeTo} aria-label="Back home" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm dark:bg-white/[0.06] dark:text-white"><ArrowLeftIcon className="h-4 w-4" /></Link>
      <h1 className="text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">Move USDC</h1>
    </div>
    <div className="mt-5 space-y-3">
      <MoveChoice to={sendTo} Icon={PaperAirplaneIcon} title="Send" detail="Send to a Pocket ID or Arc wallet address" />
      <MoveChoice to={depositTo} Icon={ArrowDownTrayIcon} title="Deposit" detail="Receive with your Pocket ID or Arc wallet address" />
    </div>
  </section>
}

function MoveChoice({ to, Icon, title, detail }: { to: string; Icon: typeof PaperAirplaneIcon; title: string; detail: string }) {
  return <Link to={to} className="flex min-h-[82px] items-center gap-4 rounded-[24px] border border-gray-100 bg-white px-5 shadow-sm transition active:scale-[0.99] dark:border-white/[0.07] dark:bg-white/[0.035]">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-white/[0.07] dark:text-gray-200"><Icon className="h-5 w-5" /></span>
    <span className="min-w-0"><span className="block text-sm font-black text-gray-950 dark:text-white">{title}</span><span className="mt-1 block text-[11px] leading-4 text-gray-400">{detail}</span></span>
  </Link>
}
