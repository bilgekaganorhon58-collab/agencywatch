-- Fix infinite recursion in organization_members RLS policies.
--
-- The previous policy queried organization_members from within a policy on
-- organization_members, which PostgreSQL detects as infinite recursion.
-- This migration replaces those self-referential checks with a SECURITY DEFINER
-- helper that reads membership with the table owner's privileges (bypassing RLS).

create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid();
$$;

revoke all on function public.current_user_organization_ids() from public;
grant execute on function public.current_user_organization_ids() to authenticated;

-- organizations
drop policy if exists "organizations_select_members" on public.organizations;
create policy "organizations_select_members"
  on public.organizations
  for select
  to authenticated
  using (
    id in (select public.current_user_organization_ids())
  );

-- organization_members (no self-reference)
drop policy if exists "org_members_select_own_org" on public.organization_members;
create policy "org_members_select_own_org"
  on public.organization_members
  for select
  to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
  );

-- monitors
drop policy if exists "monitors_select_members" on public.monitors;
create policy "monitors_select_members"
  on public.monitors
  for select
  to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
  );

drop policy if exists "monitors_insert_members" on public.monitors;
create policy "monitors_insert_members"
  on public.monitors
  for insert
  to authenticated
  with check (
    organization_id in (select public.current_user_organization_ids())
  );

drop policy if exists "monitors_update_members" on public.monitors;
create policy "monitors_update_members"
  on public.monitors
  for update
  to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
  )
  with check (
    organization_id in (select public.current_user_organization_ids())
  );

drop policy if exists "monitors_delete_members" on public.monitors;
create policy "monitors_delete_members"
  on public.monitors
  for delete
  to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
  );
