'use client'

import { useActionState } from 'react'
import { signup } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined)

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
        placeholder="At least 8 characters"
        required
        error={state?.fieldErrors?.password?.[0]}
      />
      {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state?.message ? <p className="text-sm text-emerald-600">{state.message}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-slate-900 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
