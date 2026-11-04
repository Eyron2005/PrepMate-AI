create or replace function public.can_access_portal_presence()
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
  ) or exists (
    select 1
    from public.staff as staff_member
    where staff_member.id = (select auth.uid())
      and coalesce(staff_member.is_active, true)
  );
$$;

revoke all on function public.can_access_portal_presence() from public;
revoke all on function public.can_access_portal_presence() from anon;
grant execute on function public.can_access_portal_presence() to authenticated;

drop policy if exists "Active admins and staff can read portal presence" on realtime.messages;
create policy "Active admins and staff can read portal presence"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'prepmate-admin-presence'
    and public.can_access_portal_presence()
  );

drop policy if exists "Active admins and staff can publish portal presence" on realtime.messages;
create policy "Active admins and staff can publish portal presence"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() = 'prepmate-admin-presence'
    and public.can_access_portal_presence()
  );
