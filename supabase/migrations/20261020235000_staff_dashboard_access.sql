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

revoke all on function public.is_current_user_staff() from public;
revoke all on function public.is_current_user_staff() from anon;
grant execute on function public.is_current_user_staff() to authenticated;

drop policy if exists "Staff read own profile" on public.staff;
create policy "Staff read own profile"
  on public.staff
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Authenticated staff manage OJT records" on public.ojt_records;
create policy "Authenticated staff manage OJT records"
  on public.ojt_records
  for all
  to authenticated
  using (public.is_current_user_staff())
  with check (public.is_current_user_staff());

grant select, insert, update, delete on public.ojt_records to authenticated;

notify pgrst, 'reload schema';
