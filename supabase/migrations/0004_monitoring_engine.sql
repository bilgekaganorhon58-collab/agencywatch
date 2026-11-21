-- =========================================================
-- Phase 2: Monitoring engine schema additions (idempotent)
-- Mevcut Phase 1 şemasına additif değişiklikler yapar.
-- =========================================================

-- 1) monitors tablosuna kontrol metadata kolonları ekle
alter table public.monitors
  add column if not exists last_checked_at timestamptz;

alter table public.monitors
  add column if not exists last_response_time_ms integer;

alter table public.monitors
  add column if not exists last_status_code integer;

alter table public.monitors
  add column if not exists consecutive_failures integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monitors_consecutive_failures_check'
      and conrelid = 'public.monitors'::regclass
  ) then
    alter table public.monitors
      add constraint monitors_consecutive_failures_check
      check (consecutive_failures >= 0);
  end if;
end
$$;

-- 2) Check geçmişi tablosu
create table if not exists public.monitor_checks (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  status_code integer,
  response_time_ms integer,
  success boolean not null,
  error_message text,
  checked_at timestamptz not null default now()
);

-- 3) İndeksler
create index if not exists monitor_checks_monitor_id_checked_at_idx
  on public.monitor_checks (monitor_id, checked_at desc);

create index if not exists monitor_checks_checked_at_idx
  on public.monitor_checks (checked_at);

-- 4) RLS
alter table public.monitor_checks enable row level security;

-- Kullanıcılar yalnızca kendi organizasyonlarına ait kontrol geçmişini okuyabilir.
drop policy if exists "monitor_checks_select_members" on public.monitor_checks;
create policy "monitor_checks_select_members"
  on public.monitor_checks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.monitors m
      where m.id = monitor_checks.monitor_id
        and m.organization_id in (select public.current_user_organization_ids())
    )
  );

-- 5) monitor_checks izinlerini açıkça sınırla
-- Supabase default privileges nedeniyle PUBLIC/anon/authenticated/service_role
-- rollerinde kalabilecek mevcut izinleri önce temizle, sonra minimum izinleri ver.

-- PUBLIC ve anon: hiçbir tablo erişimi olmasın
revoke all on table public.monitor_checks from public;
revoke all on table public.monitor_checks from anon;

-- authenticated: önce tüm izinleri kaldır, sonra yalnızca SELECT ver
revoke all on table public.monitor_checks from authenticated;
grant select on table public.monitor_checks to authenticated;

-- service_role: worker için gereken minimum izinler
revoke all on table public.monitor_checks from service_role;
grant select, insert, delete on table public.monitor_checks to service_role;

-- 6) Worker'ın monitor durumunu güncelleyebilmesi için monitors üzerinde minimum izin
-- Mevcut authenticated/anon/public izinlerine dokunulmaz.
grant select, update on table public.monitors to service_role;
