import { useEffect, useState } from 'react'
import {
  CheckIcon,
  DocumentCheckIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { usePrivy } from '@privy-io/react-auth'
import { Link } from '../lib/router'
import { useHashPayStreamSessionSplash } from '../lib/useHashPayStreamSessionSplash'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

const agreementScenes = [
  { src: '/brand/agreement-freelancer.jpeg', alt: 'Independent professional working from a quiet studio', eyebrow: 'Delivery agreement', title: 'One release', objectPosition: 'center 46%' },
  { src: '/brand/agreement-creative.jpeg', alt: 'Creative professional preparing a project delivery', eyebrow: 'Delivery agreement', title: 'Milestone delivery', objectPosition: 'center 44%' },
  { src: '/brand/agreement-team.jpeg', alt: 'A team reviewing work together', eyebrow: 'Delivery agreement', title: 'Progress release', objectPosition: 'center center' },
  { src: '/brand/agreement-colour.jpeg', alt: 'Independent professional celebrating work completed on a laptop', eyebrow: 'USDC protection', title: 'Protected until approval', objectPosition: 'center 46%' },
]

export default function StreamPayLanding() {
  const createTo = useStreamPayPath('/agreements/new')
  const { authenticated } = usePrivy()
  const splashState = useHashPayStreamSessionSplash(!authenticated)
  const [activeScene, setActiveScene] = useState(0)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const desktop = window.matchMedia('(min-width: 640px)')
    let interval: number | undefined

    const startRotation = () => {
      if (interval) window.clearInterval(interval)
      interval = undefined
      if (reducedMotion.matches || !desktop.matches) {
        setActiveScene(0)
        return
      }
      interval = window.setInterval(() => {
        setActiveScene(current => (current + 1) % agreementScenes.length)
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

  return (
    <div className="relative flex w-full max-w-[1440px] flex-1">
      <section className="grid min-h-[100dvh] w-full items-center gap-12 py-12 lg:h-[100dvh] lg:min-h-0 lg:grid-cols-[1.1fr_.9fr] lg:gap-20 lg:py-6">
        <div className="relative order-2 mx-auto w-full max-w-lg lg:order-1 lg:h-full lg:max-w-none">
          <div className="absolute -inset-10 -z-10 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.16),transparent_68%)]" />
          <div className="relative h-[500px] overflow-hidden rounded-[2rem] border border-white/80 bg-slate-900 shadow-[0_34px_100px_-42px_rgba(15,23,42,0.58)] dark:border-white/10 sm:h-[540px] lg:h-full">
            {agreementScenes.map((scene, index) => (
              <img
                key={scene.src}
                src={scene.src}
                alt={index === 0 ? scene.alt : ''}
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
                <ShieldCheckIcon className="h-3.5 w-3.5" />
                Arc Agreement
              </span>
              <span className="rounded-full border border-emerald-200/25 bg-emerald-300/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-950 shadow-sm">Protected</span>
            </div>

            <div className="absolute bottom-5 left-5 right-5 rounded-[1.5rem] border border-white/25 bg-white/90 p-5 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,.28)] backdrop-blur-xl sm:bottom-6 sm:left-6 sm:right-6 sm:p-6">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-blue-700">{agreementScenes[activeScene].eyebrow}</p>
                  <p className="mt-2 text-lg font-semibold tracking-[-0.02em]">{agreementScenes[activeScene].title}</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <DocumentCheckIcon className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-[10px] font-semibold text-slate-500 sm:text-[11px]">
                <span className="flex items-center gap-1.5"><CheckIcon className="h-3.5 w-3.5 text-emerald-600" />Terms set</span>
                <span className="flex items-center gap-1.5"><CheckIcon className="h-3.5 w-3.5 text-emerald-600" />USDC protected</span>
                <span className="flex items-center gap-1.5 text-slate-900"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />Payer review</span>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 mx-auto w-full max-w-md lg:order-2 lg:flex lg:h-full lg:items-center">
          {authenticated ? (
            <section className="flex min-h-[64vh] w-full flex-col items-center justify-center text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Arc Agreements</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Create a protected payment.</h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
                Set the terms and create a payer link for your next agreement.
              </p>
              <Link to={createTo} className="mt-7 rounded-xl bg-gray-950 px-3.5 py-2.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">
                New agreement
              </Link>
            </section>
          ) : (
            <AgreementSignInLanding splashState={splashState} />
          )}
        </div>
      </section>

    </div>
  )
}
