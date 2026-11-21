import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const verifySession = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return { isAuth: true as const, userId: user.id, email: user.email ?? '' }
})

export const getUserOrganizations = cache(async () => {
  const session = await verifySession()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(id, name)')
    .eq('user_id', session.userId)

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
})
