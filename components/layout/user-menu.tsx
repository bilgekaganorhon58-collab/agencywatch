'use client'

import { useTransition } from 'react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

export function UserMenu({ email }: { email: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-slate-600 sm:inline">{email}</span>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => logout())}
      >
        {pending ? 'Signing out…' : 'Log out'}
      </Button>
    </div>
  )
}
