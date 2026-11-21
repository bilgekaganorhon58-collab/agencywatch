-- =========================================================
-- Phase 2: Monitor lease / atomic claim support
-- Idempotent migration draft
-- =========================================================

-- 1) Lease metadata columns on monitors
alter table public.monitors
  add column if not exists check_lease_token uuid;

alter table public.monitors
  add column if not exists check_lease_expires_at timestamptz;

create index if not exists monitors_check_lease_expires_at_idx
  on public.monitors (check_lease_expires_at);

-- 2) Atomically claim due monitors
create or replace function public.claim_due_monitors(
  p_batch_size integer,
  p_lease_seconds integer,
  p_worker_token uuid
)
returns setof public.monitors
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_batch_size is null or p_batch_size <= 0 then
    raise exception 'p_batch_size must be a positive integer';
  end if;

  if p_lease_seconds is null or p_lease_seconds <= 0 then
    raise exception 'p_lease_seconds must be a positive integer';
  end if;

  if p_worker_token is null then
    raise exception 'p_worker_token is required';
  end if;

  return query
  with due as (
    select m.id
    from public.monitors as m
    where (
      m.last_checked_at is null
      or m.last_checked_at + make_interval(secs => m.check_interval_seconds) <= now()
    )
      and (
        m.check_lease_expires_at is null
        or m.check_lease_expires_at < now()
      )
    order by m.last_checked_at nulls first, m.created_at
    limit p_batch_size
    for update skip locked
  ),
  claimed as (
    update public.monitors as m
    set
      check_lease_token = p_worker_token,
      check_lease_expires_at = now() + make_interval(secs => p_lease_seconds)
    from due
    where m.id = due.id
    returning m.*
  )
  select *
  from claimed;
end;
$$;

-- 3) Restrict function execution to service_role only
revoke all on function public.claim_due_monitors(integer, integer, uuid) from public;
revoke all on function public.claim_due_monitors(integer, integer, uuid) from anon;
revoke all on function public.claim_due_monitors(integer, integer, uuid) from authenticated;
grant execute on function public.claim_due_monitors(integer, integer, uuid) to service_role;
