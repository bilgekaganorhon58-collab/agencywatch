-- AgencyWatch initial schema

create extension if not exists "pgcrypto";

-- organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- organization_members
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);
create index if not exists organization_members_org_id_idx
  on public.organization_members (organization_id);

-- monitors
create table if not exists public.monitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  url text not null,
  status text not null default 'unknown',
  check_interval_seconds integer not null default 300,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitors_status_check
    check (status in ('unknown', 'up', 'down', 'degraded')),
  constraint monitors_interval_check
    check (check_interval_seconds > 0)
);

create index if not exists monitors_org_id_idx
  on public.monitors (organization_id);
create index if not exists monitors_created_at_idx
  on public.monitors (created_at desc);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists monitors_set_updated_at on public.monitors;
create trigger monitors_set_updated_at
before update on public.monitors
for each row execute function public.set_updated_at();

-- Default organization for new users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  -- Avoid duplicate organization creation if a membership already exists.
  if exists (select 1 from public.organization_members where user_id = new.id) then
    return new;
  end if;

  insert into public.organizations (name)
  values ('My Organization')
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.monitors enable row level security;

-- organizations policies
drop policy if exists "organizations_select_members" on public.organizations;
create policy "organizations_select_members"
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

-- organization_members policies
drop policy if exists "org_members_select_own_org" on public.organization_members;
create policy "org_members_select_own_org"
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_members.organization_id
        and m.user_id = auth.uid()
    )
  );

-- monitors policies
drop policy if exists "monitors_select_members" on public.monitors;
create policy "monitors_select_members"
  on public.monitors
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = monitors.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "monitors_insert_members" on public.monitors;
create policy "monitors_insert_members"
  on public.monitors
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = monitors.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "monitors_update_members" on public.monitors;
create policy "monitors_update_members"
  on public.monitors
  for update
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = monitors.organization_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = monitors.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "monitors_delete_members" on public.monitors;
create policy "monitors_delete_members"
  on public.monitors
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = monitors.organization_id
        and m.user_id = auth.uid()
    )
  );
