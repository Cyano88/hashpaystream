import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'

type LegalPage = 'terms' | 'privacy'

const content: Record<LegalPage, {
  eyebrow: string
  title: string
  introduction: string
  sections: Array<{ title: string; body: string }>
}> = {
  terms: {
    eyebrow: 'Service terms',
    title: 'HashPayStream terms of use',
    introduction: 'These terms apply when you use HashPayStream to create, review, and manage protected USDC agreements.',
    sections: [
      {
        title: 'The service',
        body: 'HashPayStream provides the customer experience for Arc Agreements. Hash PayLink separately provides agreement policy, payer checkout, escrow execution, chain reconciliation, signed lifecycle updates, and authoritative receipts.',
      },
      {
        title: 'Your responsibilities',
        body: 'You must provide accurate agreement terms, use an address you control or are authorized to use, review payer links before sharing them, and submit truthful delivery information. A payer must independently review an agreement before funding or approving a release.',
      },
      {
        title: 'Test network',
        body: 'The current Arc Agreement pilot operates on Arc Testnet. Testnet assets and transactions are for testing and may not represent production availability or value.',
      },
      {
        title: 'Agreement outcomes',
        body: 'Release, cancellation, expiry, and refund outcomes follow the agreement terms and confirmed Arc state. HashPayStream does not treat a browser redirect or an unsigned message as proof of payment.',
      },
      {
        title: 'Support',
        body: 'If an agreement or account display appears incorrect, stop taking further action and contact support before relying on it.',
      },
    ],
  },
  privacy: {
    eyebrow: 'Privacy notice',
    title: 'How HashPayStream handles data',
    introduction: 'This notice explains the information used to authenticate you, associate agreements with your account, and display agreement activity.',
    sections: [
      {
        title: 'Identity',
        body: 'HashPayStream uses Privy for email-based authentication. Privy is configured as an identity provider only; HashPayStream does not create an embedded wallet or enable external-wallet connection through its sign-in flow.',
      },
      {
        title: 'Agreement records',
        body: 'HashPayStream stores an opaque account-to-agreement ownership record and webhook-derived lifecycle information in its own database. It also processes the agreement details and delivery information you submit.',
      },
      {
        title: 'Service providers',
        body: 'HashPayStream uses service providers for authentication, hosting, database storage, and the authenticated Hash PayLink APIs and signed webhooks required to operate Arc Agreements.',
      },
      {
        title: 'Wallet security',
        body: 'HashPayStream does not ask for or store wallet private keys. Never send a private key, recovery phrase, login code, or server credential through an agreement or support message.',
      },
      {
        title: 'Questions and requests',
        body: 'Contact HashPayStream support if you have a privacy question or need help with information connected to your account.',
      },
    ],
  },
}

export default function StreamPayLegal({ page }: { page: LegalPage }) {
  const document = content[page]
  const homeTo = useStreamPayPath('/')

  return (
    <article className="w-full max-w-3xl py-10 sm:py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">{document.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">{document.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-500 dark:text-gray-400">{document.introduction}</p>
      <p className="mt-3 text-xs text-gray-400">Last updated 6 August 2026</p>

      <div className="mt-9 divide-y divide-gray-200 border-y border-gray-200 dark:divide-white/10 dark:border-white/10">
        {document.sections.map(section => (
          <section key={section.title} className="py-6 sm:py-7">
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{section.title}</h2>
            <p className="mt-2 text-sm leading-7 text-gray-500 dark:text-gray-400">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold">
        <Link to={homeTo} className="text-gray-950 dark:text-white">Return to HashPayStream</Link>
        <a href="https://x.com/Hash_PayLink" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400">Contact support</a>
      </div>
    </article>
  )
}
