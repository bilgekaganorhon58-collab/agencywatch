-- Grant table-level privileges required for RLS policies to take effect.
--
-- RLS policies alone are not sufficient: the authenticated role must also have
-- the underlying table privileges. Without these grants, Supabase returns
-- "permission denied for table ..." even when a matching RLS policy exists.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organization_members to authenticated;
grant select, insert, update, delete on table public.monitors to authenticated;

-- Ensure the SECURITY DEFINER helper remains callable by authenticated users.
grant execute on function public.current_user_organization_ids() to authenticated;
