type LoadingRingProps = {
  className?: string
  label?: string
}

export function LoadingRing({ className = 'h-5 w-5', label = 'Loading' }: LoadingRingProps) {
  return <span role="status" aria-label={label} className={`${className} inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none`} />
}
