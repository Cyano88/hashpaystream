type Active = 'home' | 'agreements' | 'requests' | 'account' | 'savings' | 'funding'
function Bone({ className }: { className: string }) { return <span aria-hidden="true" className={className} /> }

export function StreamPayLoadingState({ active }: { active: Active }) {
  const label = `Opening ${active === 'home' ? 'Home' : active[0].toUpperCase() + active.slice(1)}`
  if (active === 'funding') return <section aria-busy="true" aria-label="Opening Funding" className="stream-screen w-full max-w-md py-5">
    <div className="flex items-center gap-3"><Bone className="h-10 w-10 rounded-full" /><div><Bone className="h-4 w-20" /><Bone className="mt-2 h-2.5 w-36" /></div></div>
    <div className="mt-6 rounded-[24px] border border-zinc-800 bg-zinc-950 p-4"><Bone className="h-3 w-24 !bg-white/15" /><Bone className="mt-3 h-9 w-32 !bg-white/20" /><div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3"><Bone className="h-8 w-20 !bg-white/15" /><Bone className="h-8 w-16 !bg-white/15" /></div></div>
    <div className="mt-5 space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="stream-card flex items-center gap-3 p-4"><Bone className="h-11 w-11 rounded-full" /><div className="flex-1"><Bone className="h-3 w-32" /><Bone className="mt-2 h-2.5 w-20" /></div><Bone className="h-4 w-16" /></div>)}</div>
  </section>
  if (active === 'savings') return <section aria-busy="true" aria-label="Opening Savings" className="stream-screen w-full max-w-md py-5">
    <div className="flex items-center gap-3"><Bone className="h-10 w-10 rounded-full" /><div><Bone className="h-4 w-20" /><Bone className="mt-2 h-2.5 w-32" /></div></div>
    <div className="mt-6 rounded-[26px] border border-emerald-900/70 bg-[#07140d] p-5"><Bone className="h-3 w-20 !bg-white/15" /><Bone className="mt-4 h-10 w-36 !bg-white/20" /><div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">{Array.from({ length: 3 }).map((_, index) => <div key={index}><Bone className="h-2.5 w-14 !bg-white/15" /><Bone className="mt-2 h-3 w-16 !bg-white/20" /></div>)}</div></div>
    <div className="mt-5 stream-card p-5"><Bone className="h-10 w-10 rounded-2xl" /><Bone className="mt-4 h-4 w-36" /><Bone className="mt-3 h-3 w-full" /><Bone className="mt-2 h-3 w-3/4" /></div>
  </section>
  if (active === 'home') return <section aria-busy="true" aria-label="Opening Home" className="stream-screen w-full max-w-md space-y-4 py-5">
    <div className="rounded-[26px] border border-zinc-800 bg-zinc-950 p-5 dark:border-[#262626] dark:bg-[#121212]"><div className="flex justify-between"><Bone className="h-3 w-24 !bg-white/20" /><Bone className="h-9 w-9 rounded-full !bg-white/15" /></div><Bone className="mt-4 h-10 w-40 !bg-white/20" /></div>
    <div className="grid grid-cols-4 gap-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="stream-card p-3"><Bone className="mx-auto h-6 w-6 rounded-full" /><Bone className="mx-auto mt-3 h-2.5 w-10" /></div>)}</div>
    <div className="stream-card p-4"><Bone className="h-3 w-24" />{Array.from({ length: 3 }).map((_, index) => <div key={index} className="mt-4 flex items-center gap-3"><Bone className="h-9 w-9 rounded-full" /><div className="flex-1"><Bone className="h-3 w-28" /><Bone className="mt-2 h-2.5 w-20" /></div><Bone className="h-3 w-12" /></div>)}</div>
  </section>
  if (active === 'account') return <section aria-busy="true" aria-label="Opening Account" className="w-full max-w-md py-7"><Bone className="mx-auto h-20 w-20 rounded-full" /><Bone className="mx-auto mt-4 h-5 w-32" /><Bone className="mx-auto mt-3 h-3 w-44" /><div className="mt-8 space-y-3">{Array.from({ length: 5 }).map((_, index) => <Bone key={index} className="h-16 w-full rounded-[22px]" />)}</div></section>
  return <section aria-busy="true" aria-label={active === 'requests' ? 'Opening Requests' : 'Opening Agreements'} className="stream-screen w-full max-w-md py-5"><div className="stream-segment grid-cols-2"><Bone className="h-10 rounded-full" /><Bone className="h-10 rounded-full" /></div><div className="mt-4 space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="stream-card p-4"><div className="flex gap-3"><Bone className="h-10 w-10 rounded-2xl" /><div className="flex-1"><Bone className="h-3 w-20" /><Bone className="mt-3 h-4 w-3/4" /><Bone className="mt-2 h-3 w-full" /></div></div><Bone className="mt-4 h-11 w-full rounded-full" /></div>)}</div></section>
}
