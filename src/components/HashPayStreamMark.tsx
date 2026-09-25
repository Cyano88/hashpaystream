type HashPayStreamMarkProps = {
  className?: string
  title?: string
  surface?: 'auto' | 'dark'
}

export function HashPayStreamMark({ className = 'h-6 w-6', title, surface = 'auto' }: HashPayStreamMarkProps) {
  return <span className={`stream-brand-mark ${className}`} data-surface={surface}>
    <img src="/brand/hashpaystream-mark-light.svg" className="stream-brand-light h-full w-full object-contain" alt={title ?? ''} aria-hidden={title ? undefined : true} />
    <img src="/brand/hashpaystream-mark.png" className="stream-brand-dark h-full w-full object-contain" alt={title ?? ''} aria-hidden={title ? undefined : true} />
  </span>
}
