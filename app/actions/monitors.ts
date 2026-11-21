'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { monitorSchema } from '@/lib/validation/monitor'

export type MonitorFormState = {
  error?: string
  success?: boolean
  fieldErrors?: {
    name?: string[]
    url?: string[]
  }
}

export async function addMonitor(
  _prevState: MonitorFormState | undefined,
  formData: FormData,
): Promise<MonitorFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const parsed = monitorSchema.safeParse({
    name: formData.get('name'),
    url: formData.get('url'),
  })

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (membershipError || !membership) {
    return { error: 'No organization found for your account.' }
  }

  const { error } = await supabase.from('monitors').insert({
    organization_id: membership.organization_id,
    name: parsed.data.name,
    url: parsed.data.url,
    status: 'unknown',
    check_interval_seconds: 300,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteMonitor(formData: FormData) {
  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    return
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.from('monitors').delete().eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/dashboard')
}
