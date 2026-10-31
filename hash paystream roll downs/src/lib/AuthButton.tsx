import type { ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'

type AuthButtonProps = {
  className?: string
  disabled?: boolean
  debugLabel?: string
  logoutOnAuthenticated?: boolean
  children: ReactNode
}

export function AuthButton({ className, disabled, logoutOnAuthenticated = true, children }: AuthButtonProps) {
  const { ready, authenticated, login, logout } = usePrivy()

  async function handleClick() {
    if (!ready) return
    if (authenticated) {
      if (logoutOnAuthenticated) await logout()
      return
    }
    login()
  }

  return (
    <button type="button" className={className} disabled={disabled || !ready} onClick={() => void handleClick()}>
      {children}
    </button>
  )
}
