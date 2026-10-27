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
      and coalesce(staff_member.is_active, true)
  );
$$;

revoke all on function public.is_current_user_admin() from public;
revoke all on function public.is_current_user_admin() from anon;
grant execute on function public.is_current_user_admin() to authenticated;

revoke all on function public.is_current_user_staff() from public;
revoke all on function public.is_current_user_staff() from anon;
grant execute on function public.is_current_user_staff() to authenticated;

create table if not exists public.staff_student_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (staff_id, student_user_id)
);

create index if not exists staff_student_assignments_student_user_id_idx
  on public.staff_student_assignments (student_user_id);

alter table public.staff_student_assignments enable row level security;

create or replace function public.staff_can_view_student(p_student_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_current_user_staff()
    and exists (
      select 1
      from public.staff_student_assignments as assignment
      where assignment.staff_id = (select auth.uid())
        and assignment.student_user_id = p_student_user_id
    );
$$;

revoke all on function public.staff_can_view_student(uuid) from public;
revoke all on function public.staff_can_view_student(uuid) from anon;
grant execute on function public.staff_can_view_student(uuid) to authenticated;

do $$
declare
  target_table text;
  target_policy record;
begin
  foreach target_table in array array[
    'admins',
    'profiles',
    'interview_sessions',
    'interview_results',
    'ojt_records',
    'questions',
    'staff_student_assignments'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null then
      for target_policy in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = target_table
      loop
        execute format(
          'drop policy if exists %I on public.%I',
          target_policy.policyname,
          target_table
        );
      end loop;
    end if;
  end loop;
end;
$$;

alter table public.admins enable row level security;
create policy "Admins manage admin accounts"
  on public.admins
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Users read their own admin role"
  on public.admins
  for select
  to authenticated
  using (id = (select auth.uid()));

alter table public.profiles enable row level security;
create policy "Admins manage student profiles"
  on public.profiles
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Users read their own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or auth_user_id = (select auth.uid()));

create policy "Users create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()) or auth_user_id = (select auth.uid()));

create policy "Users update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) or auth_user_id = (select auth.uid()))
  with check (id = (select auth.uid()) or auth_user_id = (select auth.uid()));

create policy "Assigned staff read student profiles"
  on public.profiles
  for select
  to authenticated
  using (
    public.staff_can_view_student(coalesce(auth_user_id, id))
  );

alter table public.staff_student_assignments enable row level security;
create policy "Admins manage staff student assignments"
  on public.staff_student_assignments
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Staff read their student assignments"
  on public.staff_student_assignments
  for select
  to authenticated
  using (staff_id = (select auth.uid()) and public.is_current_user_staff());

alter table public.interview_sessions enable row level security;
create policy "Admins manage interview sessions"
  on public.interview_sessions
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Users read their own interview sessions"
  on public.interview_sessions
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "Users create their own interview sessions"
  on public.interview_sessions
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "Users update their own interview sessions"
  on public.interview_sessions
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Assigned staff view interview sessions"
  on public.interview_sessions
  for select
  to authenticated
  using (public.staff_can_view_student(profile_id));

alter table public.interview_results enable row level security;
create policy "Admins manage interview results"
  on public.interview_results
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Users read their own interview results"
  on public.interview_results
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "Users create their own interview results"
  on public.interview_results
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "Users update their own interview results"
  on public.interview_results
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Assigned staff view interview results"
  on public.interview_results
  for select
  to authenticated
  using (public.staff_can_view_student(profile_id));

alter table public.ojt_records enable row level security;
create policy "Admins manage all OJT records"
  on public.ojt_records
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Staff view assigned OJT records"
  on public.ojt_records
  for select
  to authenticated
  using (
    assigned_staff_id = (select auth.uid())
    and public.is_current_user_staff()
  );

create policy "Staff create assigned OJT records"
  on public.ojt_records
  for insert
  to authenticated
  with check (
    assigned_staff_id = (select auth.uid())
    and public.is_current_user_staff()
  );

create policy "Staff update assigned OJT records"
  on public.ojt_records
  for update
  to authenticated
  using (
    assigned_staff_id = (select auth.uid())
    and public.is_current_user_staff()
  )
  with check (
    assigned_staff_id = (select auth.uid())
    and public.is_current_user_staff()
  );

create policy "Staff delete assigned OJT records"
  on public.ojt_records
  for delete
  to authenticated
  using (
    assigned_staff_id = (select auth.uid())
    and public.is_current_user_staff()
  );

alter table public.questions enable row level security;
create policy "Admins manage interview questions"
  on public.questions
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Users read active interview questions"
  on public.questions
  for select
  to anon, authenticated
  using (is_active is true);

grant select, insert, update, delete on public.admins to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.staff_student_assignments to authenticated;
grant select, insert, update, delete on public.interview_sessions to authenticated;
grant select, insert, update, delete on public.interview_results to authenticated;
grant select, insert, update, delete on public.ojt_records to authenticated;
grant select, insert, update, delete on public.questions to authenticated;

notify pgrst, 'reload schema';
