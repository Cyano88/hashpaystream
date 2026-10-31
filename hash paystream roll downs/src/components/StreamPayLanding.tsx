import { useEffect, useState } from 'react'
import {
  ArrowsRightLeftIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline'
import { usePrivy } from '@privy-io/react-auth'
import { Navigate } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

const productScenes = [
  { src: '/brand/agreement-freelancer.jpeg', alt: 'Independent professional working from a quiet studio', category: 'Payments', title: 'Send and receive USDC.', description: 'Move digital dollars with your Arc wallet.', Icon: ArrowsRightLeftIcon, objectPosition: 'center 46%' },
  { src: '/brand/agreement-creative.jpeg', alt: 'Creative professional preparing a project delivery', category: 'Work agreements', title: 'Start with clear terms.', description: 'Keep your work, payment terms and delivery updates together.', Icon: DocumentTextIcon, objectPosition: 'center 44%' },
  { src: '/brand/agreement-team.jpeg', alt: 'A team reviewing work together', category: 'Trade', title: 'Agree before you pay.', description: 'List an item and agree on the price and delivery with your buyer.', Icon: ShoppingBagIcon, objectPosition: 'center center' },
  { src: '/brand/agreement-colour.jpeg', alt: 'Independent professional celebrating work completed on a laptop', category: 'xStocks', title: 'More ways to use your stocks.', description: 'View your holdings, explore swaps and pay for trades with xStocks on X Layer.', Icon: ChartBarIcon, objectPosition: 'center 46%' },
]

export default function StreamPayLanding() {
  const homeTo = useStreamPayPath('/home')
  const { authenticated } = usePrivy()
  const [activeScene, setActiveScene] = useState(0)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const desktop = window.matchMedia('(min-width: 1024px)')
    let interval: number | undefined

    const startRotation = () => {
      if (interval) window.clearInterval(interval)
      interval = undefined
      if (reducedMotion.matches || !desktop.matches) {
        setActiveScene(0)
        return
      }
      interval = window.setInterval(() => {
        setActiveScene(current => (current + 1) % productScenes.length)
      }, 6500)
    }

    startRotation()
    reducedMotion.addEventListener('change', startRotation)
    desktop.addEventListener('change', startRotation)

    return () => {
      if (interval) window.clearInterval(interval)
      reducedMotion.removeEventListener('change', startRotation)
      desktop.removeEventListener('change', startRotation)
    }
  }, [])

  const scene = productScenes[activeScene]
  const SceneIcon = scene.Icon

  if (authenticated) return <Navigate to={homeTo} replace />

  return (
    <div className="relative flex w-full max-w-[1440px] flex-1">
      <section className="grid min-h-[100dvh] w-full items-center gap-12 py-12 lg:h-[100dvh] lg:min-h-0 lg:grid-cols-[1.1fr_.9fr] lg:gap-20 lg:py-6">
        <div className="relative order-2 mx-auto hidden w-full max-w-lg lg:order-1 lg:block lg:h-full lg:max-w-none">
          <div className="absolute -inset-10 -z-10 hidden bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.16),transparent_68%)] sm:block" />
          <div className="relative h-[500px] overflow-hidden rounded-[2rem] border border-white/80 bg-slate-900 shadow-[0_34px_100px_-42px_rgba(15,23,42,0.58)] dark:border-white/10 sm:h-[540px] lg:h-full">
            {productScenes.map((scene, index) => (
              <img
                key={scene.src}
                src={scene.src}
                alt={scene.alt}
                aria-hidden={index !== activeScene}
                decoding="async"
                className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1400ms] ease-out ${index === activeScene ? 'scale-100 opacity-100' : 'scale-[1.025] opacity-0'}`}
                style={{ objectPosition: scene.objectPosition }}
              />
            ))}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,.14)_0%,rgba(15,23,42,.02)_38%,rgba(15,23,42,.80)_100%)]" />
            <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14),inset_0_-90px_120px_rgba(15,23,42,.16)]" />

            <div className="absolute left-5 right-5 top-5 flex items-center justify-between sm:left-6 sm:right-6 sm:top-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-slate-950/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                <SceneIcon className="h-3.5 w-3.5" />
                {scene.category}
              </span>
            </div>

            <div className="absolute bottom-5 left-5 right-5 rounded-[1.5rem] border border-white/25 bg-white/90 p-5 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,.28)] backdrop-blur-xl sm:bottom-6 sm:left-6 sm:right-6 sm:p-6">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-lg font-semibold tracking-[-0.02em]">{scene.title}</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{scene.description}</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <SceneIcon className="h-5 w-5" />
                </span>
              </div>


            </div>
          </div>
        </div>

        <div className="order-1 mx-auto w-full max-w-md lg:order-2 lg:flex lg:h-full lg:items-center">
          <AgreementSignInLanding compact />
        </div>
      </section>

    </div>
  )
}
