'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)

  return (
    <form action={action} className="flex flex-col gap-4">
      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        required
        error={state?.fieldErrors?.email?.[0]}
      />
      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="••••••••"
        required
        error={state?.fieldErrors?.password?.[0]}
      />
      {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-center text-sm text-slate-500">
        No account?{' '}
        <Link href="/signup" className="font-medium text-slate-900 hover:underline">
          Create one
        </Link>
      </p>
    </form>
  )
}
