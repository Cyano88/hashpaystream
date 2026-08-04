type HashPayStreamMarkProps = {
  className?: string
  title?: string
}

export function HashPayStreamMark({ className = 'h-6 w-6', title }: HashPayStreamMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  )
}
