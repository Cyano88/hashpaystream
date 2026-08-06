type HashPayStreamMarkProps = {
  className?: string
  title?: string
}

export function HashPayStreamMark({ className = 'h-6 w-6', title }: HashPayStreamMarkProps) {
  return (
    <img
      src="/brand/hashpaystream-mark.png"
      className={className}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
    />
  )
}
