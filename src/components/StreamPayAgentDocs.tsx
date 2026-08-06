import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  CommandLineIcon,
  KeyIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

const endpoint = '/api/hashpaystream/v1/agent/agreements'

const actions = [
  { action: 'prepare', purpose: 'Prepare the agreement for agent-funded activation.' },
  { action: 'prepare-call', purpose: 'Return an exact Arc call for an authorized activation stage.' },
  { action: 'circle-execute', purpose: 'Execute a prepared activation call with the connected Circle Agent Wallet.' },
  { action: 'record', purpose: 'Record the transaction hash broadcast by another compatible agent wallet.' },
  { action: 'status', purpose: 'Reconcile activation against confirmed upstream and Arc state.' },
  { action: 'review', purpose: 'Read the delivery state that is ready for payer review.' },
  { action: 'delivery-decision', purpose: 'Accept a delivery or report an issue.' },
  { action: 'lifecycle-prepare-call', purpose: 'Prepare an eligible cancellation or refund call.' },
  { action: 'lifecycle-circle-execute', purpose: 'Execute an eligible cancellation or refund with the connected Circle Agent Wallet.' },
  { action: 'lifecycle-record', purpose: 'Record the lifecycle transaction broadcast by another compatible agent wallet.' },
  { action: 'lifecycle-status', purpose: 'Reconcile cancellation or refund confirmation.' },
]

const createExample = `curl https://hashpaystream.app${endpoint} \\
  -X POST \\
  -H "Authorization: Bearer $HPS_AGENT_TOKEN" \\
  -H "Idempotency-Key: your-stable-request-id" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template": "fixed_unlock",
    "title": "Verified research delivery",
    "amount": "0.10",
    "recipient": "0x..."
  }'`

const listExample = `curl "https://hashpaystream.app${endpoint}" \\
  -H "Authorization: Bearer $HPS_AGENT_TOKEN"`

const actionExample = `curl https://hashpaystream.app${endpoint} \\
  -X POST \\
  -H "Authorization: Bearer $HPS_AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "prepare",
    "agreementId": "agr_...",
    "payerAddress": "0x..."
  }'`

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-4 max-w-full overflow-x-auto rounded-2xl bg-gray-950 p-4 text-[11px] leading-6 text-gray-200 dark:bg-black sm:p-5 sm:text-xs">
      <code>{children}</code>
    </pre>
  )
}

export default function StreamPayAgentDocs() {
  const docsTo = useStreamPayPath('/docs')

  return (
    <article className="w-full max-w-4xl py-10 sm:py-16">
      <Link to={docsTo} className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
        <ArrowLeftIcon className="h-4 w-4" />
        Customer guide
      </Link>

      <div className="mt-7 max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Agent API · Private pilot</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">Arc Agreements for autonomous agents.</h1>
        <p className="mt-4 text-sm leading-7 text-gray-500 dark:text-gray-400">
          Create and manage protected USDC agreements from an agent backend using a connected Circle Agent Wallet or another compatible Arc wallet.
        </p>
      </div>

      <section className="mt-9 grid gap-3 sm:grid-cols-3">
        {[
          { Icon: KeyIcon, title: 'Server credentials', body: 'Each HashPayStream pilot key authenticates one registered agent identity.' },
          { Icon: CommandLineIcon, title: 'Bounded execution', body: 'Use the connected Circle Agent Wallet or sign the exact prepared Arc call with another compatible wallet.' },
          { Icon: ShieldCheckIcon, title: 'Guarded lifecycle', body: 'Hash PayLink remains authoritative for policy, confirmation, releases, cancellations, refunds, and receipts.' },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b]">
            <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Before you start</h2>
        <div className="mt-5 space-y-4">
          {[
            'Pilot access is issued directly by HashPayStream. It is not created in the Hash PayLink developer portal.',
            'Keep the HashPayStream agent API key in backend secret storage. Never place it in browser code or a VITE_ variable.',
            'Use a distinct Idempotency-Key for each intended agreement creation and reuse it only when retrying that same request.',
            'Circle execution uses the Agent Wallet already connected to the Hash PayLink project owner. HashPayStream never receives a private key or recovery phrase.',
            'Use a new Idempotency-Key for each Circle approval, activation, cancellation, or refund. Reuse it only to retry that exact operation.',
          ].map(item => (
            <div key={item} className="flex gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Endpoint</p>
        <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-950 dark:text-white">{endpoint}</p>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Use HTTPS and send the pilot key as a Bearer token. GET lists owned agreements or reads one using the <code className="font-mono text-xs text-gray-700 dark:text-gray-200">id</code> query parameter. POST creates an agreement or performs an owned agreement action.</p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Create an agreement</h2>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">This fixed-release example uses placeholders only. The recipient must exactly match the Arc Testnet receiving address configured for the pilot project in Hash PayLink.</p>
        <CodeBlock>{createExample}</CodeBlock>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">List owned agreements</h2>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Ownership is derived from the authenticated pilot agent. An agent cannot list or read another identity’s agreements.</p>
        <CodeBlock>{listExample}</CodeBlock>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Prepare an agent action</h2>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Start with the server-directed action and use only stages or lifecycle actions authorized by the preceding response.</p>
        <CodeBlock>{actionExample}</CodeBlock>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Supported actions</h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#18181b]">
          {actions.map((item, index) => (
            <div key={item.action} className={`grid gap-1 px-4 py-4 sm:grid-cols-[180px_1fr] sm:gap-5 sm:px-5 ${index ? 'border-t border-gray-100 dark:border-white/10' : ''}`}>
              <code className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{item.action}</code>
              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{item.purpose}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950 sm:p-8">
        <p className="text-xs font-semibold text-blue-400 dark:text-blue-600">Pilot boundary</p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">No browser keys. No wallet custody.</h2>
        <p className="mt-3 text-sm leading-7 text-gray-300 dark:text-gray-600">The agent API does not expose a human payer link, payer-access credential, Circle session, or private key. Hash PayLink executes only its prepared agreement calls and remains authoritative for confirmed status.</p>
        <a href="https://x.com/Hash_PayLink" target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
          Request pilot access
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </a>
      </section>
    </article>
  )
}
