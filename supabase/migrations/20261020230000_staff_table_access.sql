alter table public.staff enable row level security;

drop policy if exists "Admins manage staff" on public.staff;
create policy "Admins manage staff"
  on public.staff
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admins
      where admins.id = (select auth.uid())
        and coalesce(admins.is_active, true)
    )
  )
  with check (
    exists (
      select 1
      from public.admins
      where admins.id = (select auth.uid())
        and coalesce(admins.is_active, true)
    )
  );

grant select, insert, update, delete on public.staff to authenticated;

notify pgrst, 'reload schema';
