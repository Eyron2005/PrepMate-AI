create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins as admin
    where admin.id = (select auth.uid())
      and coalesce(admin.is_active, true)
  );
$$;

create or replace function public.is_current_user_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff as staff_member
    where staff_member.id = (select auth.uid())
  );
$$;

revoke all on function public.is_current_user_admin() from public;
revoke all on function public.is_current_user_admin() from anon;
grant execute on function public.is_current_user_admin() to authenticated;

revoke all on function public.is_current_user_staff() from public;
revoke all on function public.is_current_user_staff() from anon;
grant execute on function public.is_current_user_staff() to authenticated;

alter table public.ojt_records enable row level security;

do $$
declare
  ojt_policy record;
begin
  for ojt_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ojt_records'
  loop
    execute format(
      'drop policy if exists %I on public.ojt_records',
      ojt_policy.policyname
    );
  end loop;
end;
$$;

create policy "Authenticated admins manage OJT records"
  on public.ojt_records
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Authenticated staff manage OJT records"
  on public.ojt_records
  for all
  to authenticated
  using (public.is_current_user_staff())
  with check (public.is_current_user_staff());

grant select, insert, update, delete on public.ojt_records to authenticated;

notify pgrst, 'reload schema';
