create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  department text,
  role text not null default 'Staff',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ojt_records (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text,
  contact text,
  supervisor_id uuid references public.staff(id) on delete set null,
  start_date date,
  end_date date,
  status text not null default 'Upcoming'
    check (status in ('Upcoming', 'Active', 'Completed', 'On hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

alter table public.staff enable row level security;
alter table public.ojt_records enable row level security;

drop policy if exists "Admins manage staff" on public.staff;
create policy "Admins manage staff"
  on public.staff for all to authenticated
  using (
    exists (
      select 1 from public.admins
      where admins.id = (select auth.uid())
        and coalesce(admins.is_active, true)
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where admins.id = (select auth.uid())
        and coalesce(admins.is_active, true)
    )
  );

drop policy if exists "Admins manage OJT records" on public.ojt_records;
create policy "Admins manage OJT records"
  on public.ojt_records for all to authenticated
  using (
    exists (
      select 1 from public.admins
      where admins.id = (select auth.uid())
        and coalesce(admins.is_active, true)
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where admins.id = (select auth.uid())
        and coalesce(admins.is_active, true)
    )
  );

grant select, insert, update, delete on public.staff to authenticated;
grant select, insert, update, delete on public.ojt_records to authenticated;

create or replace function public.restore_admin_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restored_counts jsonb;
begin
  if not exists (
    select 1 from public.admins
    where id = (select auth.uid())
      and coalesce(is_active, true)
  ) then
    raise exception 'Admin access is required to restore a backup';
  end if;

  if p_backup->>'format' <> 'prepmate-admin-backup'
    or p_backup->>'version' <> '1'
    or jsonb_typeof(p_backup->'tables'->'questions') is distinct from 'array'
    or jsonb_typeof(p_backup->'tables'->'staff') is distinct from 'array'
    or jsonb_typeof(p_backup->'tables'->'ojt_records') is distinct from 'array'
  then
    raise exception 'Invalid or unsupported backup file';
  end if;

  delete from public.ojt_records;
  delete from public.staff;
  delete from public.questions;

  insert into public.questions
  select * from jsonb_populate_recordset(null::public.questions, p_backup->'tables'->'questions');

  insert into public.staff
  select * from jsonb_populate_recordset(null::public.staff, p_backup->'tables'->'staff');

  insert into public.ojt_records
  select * from jsonb_populate_recordset(null::public.ojt_records, p_backup->'tables'->'ojt_records');

  select jsonb_build_object(
    'questions', (select count(*) from public.questions),
    'staff', (select count(*) from public.staff),
    'ojt_records', (select count(*) from public.ojt_records)
  ) into restored_counts;

  return restored_counts;
end;
$$;

revoke all on function public.restore_admin_backup(jsonb) from public;
revoke all on function public.restore_admin_backup(jsonb) from anon;
grant execute on function public.restore_admin_backup(jsonb) to authenticated;
