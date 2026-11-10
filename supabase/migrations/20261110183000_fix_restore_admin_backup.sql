create or replace function public.restore_admin_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  restored_counts jsonb := jsonb_build_object();
  v_table_name text;
  v_rows jsonb;
  v_row_count integer;
  v_results_max bigint;
begin
  if not exists (
    select 1 from public.admins
    where id = (select auth.uid())
      and coalesce(is_active, true)
  ) then
    raise exception 'Admin access is required to restore a backup';
  end if;

  if p_backup is null
    or p_backup->>'format' <> 'prepmate-admin-backup'
    or p_backup->>'version' <> '1'
    or jsonb_typeof(p_backup->'tables') is distinct from 'object'
    or not exists (select 1 from jsonb_object_keys(p_backup->'tables'))
  then
    raise exception 'Invalid or unsupported backup file';
  end if;

  for v_table_name in select x.key
    from jsonb_object_keys(p_backup->'tables') as x(key)
  loop
    if v_table_name not in (
      'profiles',
      'questions',
      'interview_sessions',
      'interview_results',
      'staff',
      'staff_student_assignments',
      'admins'
    ) then
      raise exception 'Unsupported backup table "%"', v_table_name;
    end if;

    if jsonb_typeof(p_backup->'tables'->v_table_name) is distinct from 'array' then
      raise exception 'Backup table "%" is invalid.', v_table_name;
    end if;
  end loop;

  if jsonb_exists(p_backup->'tables', 'profiles') then
    v_rows := p_backup->'tables'->'profiles';
    if jsonb_array_length(v_rows) = 0 then
      restored_counts := jsonb_set(restored_counts, '{profiles}', to_jsonb(0));
    else
      insert into public.profiles (
        id,
        full_name,
        created_at,
        auth_user_id,
        last_online,
        account_status,
        deactivation_reason,
        deactivation_details,
        deactivated_at,
        deactivated_by,
        deactivation_agreed,
        deactivation_agreed_at,
        email,
        avatar_url
      )
      select
        r.id,
        coalesce(r.full_name, ''),
        coalesce(r.created_at, now()),
        coalesce(r.auth_user_id, r.id),
        r.last_online,
        case
          when lower(coalesce(btrim(r.account_status), '')) in ('active', 'deactivated')
            then lower(btrim(r.account_status))
          else 'active'
        end,
        nullif(r.deactivation_reason, ''),
        nullif(r.deactivation_details, ''),
        r.deactivated_at,
        case
          when r.deactivated_by is not null
            and exists (select 1 from auth.users u where u.id = r.deactivated_by)
            then r.deactivated_by
          else null
        end,
        r.deactivation_agreed,
        r.deactivation_agreed_at,
        nullif(btrim(r.email), ''),
        nullif(btrim(r.avatar_url), '')
      from jsonb_populate_recordset(null::public.profiles, v_rows) as r
      where r.id is not null
        and exists (select 1 from auth.users u where u.id = r.id)
      on conflict (id) do update set
        full_name = excluded.full_name,
        created_at = excluded.created_at,
        auth_user_id = excluded.auth_user_id,
        last_online = excluded.last_online,
        account_status = excluded.account_status,
        deactivation_reason = excluded.deactivation_reason,
        deactivation_details = excluded.deactivation_details,
        deactivated_at = excluded.deactivated_at,
        deactivated_by = excluded.deactivated_by,
        deactivation_agreed = excluded.deactivation_agreed,
        deactivation_agreed_at = excluded.deactivation_agreed_at,
        email = coalesce(excluded.email, public.profiles.email),
        avatar_url = excluded.avatar_url;

      get diagnostics v_row_count = row_count;
      restored_counts := jsonb_set(restored_counts, '{profiles}', to_jsonb(v_row_count));
    end if;
  end if;

  if jsonb_exists(p_backup->'tables', 'questions') then
    v_rows := p_backup->'tables'->'questions';
    if jsonb_array_length(v_rows) = 0 then
      restored_counts := jsonb_set(restored_counts, '{questions}', to_jsonb(0));
    else
      insert into public.questions (
        id,
        category,
        question,
        difficulty,
        created_at,
        "is _active",
        question_set,
        ideal_answer,
        is_active,
        job_role,
        ai_suggested_difficulty,
        cognitive_level,
        difficulty_assessment,
        difficulty_reason,
        classification_status,
        classification_method
      )
      select
        r.id,
        coalesce(r.category, ''),
        r.question,
        r.difficulty,
        coalesce(r.created_at, now()),
        coalesce(r."is _active", r.is_active, true),
        r.question_set,
        r.ideal_answer,
        coalesce(r.is_active, r."is _active", true),
        r.job_role,
        r.ai_suggested_difficulty,
        r.cognitive_level,
        r.difficulty_assessment,
        r.difficulty_reason,
        r.classification_status,
        r.classification_method
      from jsonb_populate_recordset(null::public.questions, v_rows) as r
      where r.id is not null
      on conflict (id) do update set
        category = excluded.category,
        question = excluded.question,
        difficulty = excluded.difficulty,
        created_at = excluded.created_at,
        "is _active" = excluded."is _active",
        question_set = excluded.question_set,
        ideal_answer = excluded.ideal_answer,
        is_active = excluded.is_active,
        job_role = excluded.job_role,
        ai_suggested_difficulty = excluded.ai_suggested_difficulty,
        cognitive_level = excluded.cognitive_level,
        difficulty_assessment = excluded.difficulty_assessment,
        difficulty_reason = excluded.difficulty_reason,
        classification_status = excluded.classification_status,
        classification_method = excluded.classification_method;

      get diagnostics v_row_count = row_count;
      restored_counts := jsonb_set(restored_counts, '{questions}', to_jsonb(v_row_count));
    end if;
  end if;

  if jsonb_exists(p_backup->'tables', 'interview_sessions') then
    v_rows := p_backup->'tables'->'interview_sessions';
    if jsonb_array_length(v_rows) = 0 then
      restored_counts := jsonb_set(restored_counts, '{interview_sessions}', to_jsonb(0));
    else
      insert into public.interview_sessions (
        id,
        profile_id,
        overall_score,
        speech_score,
        camera_score,
        question_count,
        completed_count,
        summary,
        created_at
      )
      select
        r.id,
        r.profile_id,
        least(100, greatest(0, coalesce(r.overall_score, 0))),
        coalesce(r.speech_score, 0),
        coalesce(r.camera_score, 0),
        coalesce(r.question_count, 0),
        coalesce(r.completed_count, 0),
        coalesce(r.summary, ''),
        coalesce(r.created_at, now())
      from jsonb_populate_recordset(null::public.interview_sessions, v_rows) as r
      where r.id is not null
        and r.profile_id is not null
        and exists (select 1 from public.profiles p where p.id = r.profile_id)
      on conflict (id) do update set
        profile_id = excluded.profile_id,
        overall_score = excluded.overall_score,
        speech_score = excluded.speech_score,
        camera_score = excluded.camera_score,
        question_count = excluded.question_count,
        completed_count = excluded.completed_count,
        summary = excluded.summary,
        created_at = excluded.created_at;

      get diagnostics v_row_count = row_count;
      restored_counts := jsonb_set(restored_counts, '{interview_sessions}', to_jsonb(v_row_count));
    end if;
  end if;

  if jsonb_exists(p_backup->'tables', 'interview_results') then
    v_rows := p_backup->'tables'->'interview_results';
    if jsonb_array_length(v_rows) = 0 then
      restored_counts := jsonb_set(restored_counts, '{interview_results}', to_jsonb(0));
    else
      insert into public.interview_results (
        id,
        user_transcript,
        movement_data,
        ai_score,
        ai_feedback,
        created_at,
        profile_id,
        question_id,
        session_id
      )
      select
        r.id,
        r.user_transcript,
        r.movement_data,
        r.ai_score,
        r.ai_feedback,
        coalesce(r.created_at, now()),
        r.profile_id,
        r.question_id,
        r.session_id
      from jsonb_populate_recordset(null::public.interview_results, v_rows) as r
      where r.id is not null
      on conflict (id) do update set
        user_transcript = excluded.user_transcript,
        movement_data = excluded.movement_data,
        ai_score = excluded.ai_score,
        ai_feedback = excluded.ai_feedback,
        created_at = excluded.created_at,
        profile_id = excluded.profile_id,
        question_id = excluded.question_id,
        session_id = excluded.session_id;

      get diagnostics v_row_count = row_count;
      select max(id) into v_results_max from public.interview_results;
      perform setval(
        pg_get_serial_sequence('public.interview_results', 'id'),
        coalesce(v_results_max, 1),
        v_results_max is not null
      );
      restored_counts := jsonb_set(restored_counts, '{interview_results}', to_jsonb(v_row_count));
    end if;
  end if;

  if jsonb_exists(p_backup->'tables', 'staff') then
    v_rows := p_backup->'tables'->'staff';
    if jsonb_array_length(v_rows) = 0 then
      restored_counts := jsonb_set(restored_counts, '{staff}', to_jsonb(0));
    else
      insert into public.staff (
        id,
        full_name,
        email,
        position,
        department,
        is_active,
        created_at,
        can_email_unassigned_students
      )
      select
        r.id,
        coalesce(r.full_name, ''),
        coalesce(r.email, ''),
        coalesce(nullif(btrim(r.position), ''), 'Staff'),
        r.department,
        coalesce(r.is_active, true),
        coalesce(r.created_at, now()),
        coalesce(r.can_email_unassigned_students, false)
      from jsonb_populate_recordset(null::public.staff, v_rows) as r
      where r.id is not null
        and exists (select 1 from auth.users u where u.id = r.id)
      on conflict (id) do update set
        full_name = excluded.full_name,
        email = excluded.email,
        position = excluded.position,
        department = excluded.department,
        is_active = excluded.is_active,
        created_at = excluded.created_at,
        can_email_unassigned_students = excluded.can_email_unassigned_students;

      get diagnostics v_row_count = row_count;
      restored_counts := jsonb_set(restored_counts, '{staff}', to_jsonb(v_row_count));
    end if;
  end if;

  if jsonb_exists(p_backup->'tables', 'staff_student_assignments') then
    v_rows := p_backup->'tables'->'staff_student_assignments';
    if jsonb_array_length(v_rows) = 0 then
      restored_counts := jsonb_set(restored_counts, '{staff_student_assignments}', to_jsonb(0));
    else
      insert into public.staff_student_assignments (
        id,
        staff_id,
        student_user_id,
        assigned_by,
        created_at
      )
      select
        r.id,
        r.staff_id,
        r.student_user_id,
        case
          when r.assigned_by is not null
            and exists (select 1 from auth.users u where u.id = r.assigned_by)
            then r.assigned_by
          else null
        end,
        coalesce(r.created_at, now())
      from jsonb_populate_recordset(null::public.staff_student_assignments, v_rows) as r
      where r.id is not null
        and r.staff_id is not null
        and exists (select 1 from public.staff s where s.id = r.staff_id)
      on conflict (id) do update set
        staff_id = excluded.staff_id,
        student_user_id = excluded.student_user_id,
        assigned_by = excluded.assigned_by,
        created_at = excluded.created_at;

      get diagnostics v_row_count = row_count;
      restored_counts := jsonb_set(restored_counts, '{staff_student_assignments}', to_jsonb(v_row_count));
    end if;
  end if;

  if jsonb_exists(p_backup->'tables', 'admins') then
    v_rows := p_backup->'tables'->'admins';
    if jsonb_array_length(v_rows) = 0 then
      restored_counts := jsonb_set(restored_counts, '{admins}', to_jsonb(0));
    else
      insert into public.admins (
        id,
        full_name,
        role,
        is_active,
        created_at
      )
      select
        r.id,
        coalesce(r.full_name, ''),
        coalesce(nullif(btrim(r.role), ''), 'admin'),
        case
          when r.id = (select auth.uid()) then true
          else coalesce(r.is_active, true)
        end,
        coalesce(r.created_at, now())
      from jsonb_populate_recordset(null::public.admins, v_rows) as r
      where r.id is not null
        and exists (select 1 from auth.users u where u.id = r.id)
      on conflict (id) do update set
        full_name = excluded.full_name,
        role = excluded.role,
        is_active = excluded.is_active,
        created_at = excluded.created_at;

      get diagnostics v_row_count = row_count;
      restored_counts := jsonb_set(restored_counts, '{admins}', to_jsonb(v_row_count));
    end if;
  end if;

  return restored_counts;
end;
$$;

revoke all on function public.restore_admin_backup(jsonb) from public;
revoke all on function public.restore_admin_backup(jsonb) from anon;
grant execute on function public.restore_admin_backup(jsonb) to authenticated;

notify pgrst, 'reload schema';
