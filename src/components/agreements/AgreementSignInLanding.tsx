import { HashPayStreamMark } from '../HashPayStreamMark'
import { Link } from '../../lib/router'
import { StreamPayEmailLogin } from '../auth/StreamPayEmailLogin'

export function AgreementSignInLanding({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`flex w-full max-w-md flex-col items-center justify-center text-center ${compact ? 'min-h-0 lg:min-h-[64vh]' : 'min-h-[64vh]'}`}>
      <HashPayStreamMark className="h-14 w-14" title="HashPayStream" />
      <p className="mt-6 text-sm font-semibold tracking-tight">
        <span className="text-gray-950 dark:text-white">Hash</span>{' '}
        <span className="text-blue-600 dark:text-blue-400">PayStream</span>
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Your protected payments.</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
        Sign in to view and manage your agreements.
      </p>
      <StreamPayEmailLogin className="mt-7 w-full" />
      <div className="mt-5 flex items-center gap-4 text-xs text-gray-400">
        <Link to="/stats" className="transition-colors hover:text-gray-700 dark:hover:text-gray-200">Product stats</Link>
        <a href="https://x.com/Hash_PayLink" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gray-700 dark:hover:text-gray-200">Support</a>
      </div>
      <a
        href="https://app.hashpaylink.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Powered by Hash PayLink"
        className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        <span>Powered by</span>
        <span aria-hidden="true" className="grid h-3.5 w-3.5 place-items-center overflow-hidden bg-[#05060f]">
          <img src="/brand/hashpaylink-mark-dark.png" alt="" className="h-[9px] w-[9px] object-contain" />
        </span>
        <span>Hash PayLink</span>
      </a>

    </section>
  )
}
