'use client'

import { useActionState, useRef, useEffect } from 'react'
import { addMonitor } from '@/app/actions/monitors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AddMonitorForm() {
  const [state, action, pending] = useActionState(addMonitor, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Input
          name="name"
          label="Website name"
          placeholder="Acme Corp"
          required
          error={state?.fieldErrors?.name?.[0]}
        />
      </div>
      <div className="flex-1">
        <Input
          name="url"
          label="URL"
          placeholder="https://example.com"
          required
          error={state?.fieldErrors?.url?.[0]}
        />
      </div>
      <Button type="submit" disabled={pending} className="sm:mb-[1px]">
        {pending ? 'Adding…' : 'Add website'}
      </Button>
      {state?.error ? <p className="text-sm text-red-600 sm:col-span-3">{state.error}</p> : null}
      {state?.success ? <p className="text-sm text-emerald-600 sm:col-span-3">Website added.</p> : null}
    </form>
  )
}
