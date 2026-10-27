create or replace function public.restore_admin_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restored_counts jsonb := jsonb_build_object();
  v_table_name text;
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
    or jsonb_typeof(p_backup->'tables') is distinct from 'object'
  then
    raise exception 'Invalid or unsupported backup file';
  end if;

  for v_table_name in select x.key
    from jsonb_object_keys(p_backup->'tables') as x(key)
  loop
    if jsonb_typeof(p_backup->'tables'->v_table_name) is distinct from 'array' then
      raise exception format('Backup table "%s" is invalid.', v_table_name);
    end if;
  end loop;

  if jsonb_exists(p_backup->'tables', 'profiles') then
    delete from public.profiles;
    insert into public.profiles
    select * from jsonb_populate_recordset(null::public.profiles, p_backup->'tables'->'profiles');
    restored_counts := jsonb_set(restored_counts, '{profiles}', to_jsonb((select count(*) from public.profiles)));
  end if;

  if jsonb_exists(p_backup->'tables', 'staff') then
    delete from public.staff;
    insert into public.staff
    select * from jsonb_populate_recordset(null::public.staff, p_backup->'tables'->'staff');
    restored_counts := jsonb_set(restored_counts, '{staff}', to_jsonb((select count(*) from public.staff)));
  end if;

  if jsonb_exists(p_backup->'tables', 'questions') then
    delete from public.questions;
    insert into public.questions
    select * from jsonb_populate_recordset(null::public.questions, p_backup->'tables'->'questions');
    restored_counts := jsonb_set(restored_counts, '{questions}', to_jsonb((select count(*) from public.questions)));
  end if;

  if jsonb_exists(p_backup->'tables', 'interview_results') then
    delete from public.interview_results;
    insert into public.interview_results
    select * from jsonb_populate_recordset(null::public.interview_results, p_backup->'tables'->'interview_results');
    restored_counts := jsonb_set(restored_counts, '{interview_results}', to_jsonb((select count(*) from public.interview_results)));
  end if;

  if jsonb_exists(p_backup->'tables', 'admins') then
    delete from public.admins;
    insert into public.admins
    select * from jsonb_populate_recordset(null::public.admins, p_backup->'tables'->'admins');
    restored_counts := jsonb_set(restored_counts, '{admins}', to_jsonb((select count(*) from public.admins)));
  end if;

  if jsonb_exists(p_backup->'tables', 'interview_sessions') then
    delete from public.interview_sessions;
    insert into public.interview_sessions
    select * from jsonb_populate_recordset(null::public.interview_sessions, p_backup->'tables'->'interview_sessions');
    restored_counts := jsonb_set(restored_counts, '{interview_sessions}', to_jsonb((select count(*) from public.interview_sessions)));
  end if;

  if jsonb_exists(p_backup->'tables', 'staff_student_assignments') then
    delete from public.staff_student_assignments;
    insert into public.staff_student_assignments
    select * from jsonb_populate_recordset(null::public.staff_student_assignments, p_backup->'tables'->'staff_student_assignments');
    restored_counts := jsonb_set(restored_counts, '{staff_student_assignments}', to_jsonb((select count(*) from public.staff_student_assignments)));
  end if;

  if jsonb_exists(p_backup->'tables', 'ojt_records') then
    delete from public.ojt_records;
    insert into public.ojt_records
    select * from jsonb_populate_recordset(null::public.ojt_records, p_backup->'tables'->'ojt_records');
    restored_counts := jsonb_set(restored_counts, '{ojt_records}', to_jsonb((select count(*) from public.ojt_records)));
  end if;

  return restored_counts;
end;
$$;

revoke all on function public.restore_admin_backup(jsonb) from public;
revoke all on function public.restore_admin_backup(jsonb) from anon;
grant execute on function public.restore_admin_backup(jsonb) to authenticated;
