-- Align Interview Mode Industries & Job Roles with PrepMate AI Android App:
-- Existing Industry: Technology
-- Existing Job Roles: Frontend Developer, Backend Developer, Android Developer
-- Preserves existing Interview Categories and Difficulty Tiers (Easy, Medium, Hard) untouched.

-- 1. Strengthen whitespace + case normalization in trigger & unique indexes
create or replace function public.sync_interview_config_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_table_name in ('interview_industries', 'interview_job_roles', 'interview_question_sets') then
    if new.name is not null then
      new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
    end if;
  end if;
  if tg_table_name = 'interview_question_sets' then
    if new.status is null then
      new.status := case when coalesce(new.is_active, true) then 'active' else 'inactive' end;
    end if;
    new.is_active := (new.status = 'active');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_interview_industries_updated_at on public.interview_industries;
create trigger trg_interview_industries_updated_at
  before insert or update on public.interview_industries
  for each row execute function public.sync_interview_config_timestamps();

drop trigger if exists trg_interview_job_roles_updated_at on public.interview_job_roles;
create trigger trg_interview_job_roles_updated_at
  before insert or update on public.interview_job_roles
  for each row execute function public.sync_interview_config_timestamps();

drop index if exists public.interview_industries_name_unique_idx;
create unique index interview_industries_name_unique_idx
  on public.interview_industries (lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));

drop index if exists public.interview_job_roles_industry_name_unique_idx;
create unique index interview_job_roles_industry_name_unique_idx
  on public.interview_job_roles (industry_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));

-- 2. Align seed rows to PrepMate AI Android Interview Mode:
--    Existing Industry: Technology
--    Existing Job Roles: Frontend Developer, Backend Developer, Android Developer
--    Keep existing difficulty tiers (Easy, Medium, Hard) active and unmodified.
do $$
declare
  v_tech_id uuid;
  v_old_it_id uuid;
  v_fe_id uuid;
  v_be_id uuid;
  v_and_id uuid;
begin
  -- Ensure all 3 fixed difficulty tiers remain active
  update public.interview_difficulty_tiers
  set is_active = true
  where code in ('Easy', 'Medium', 'Hard');

  -- Reuse existing 'Technology' if present, else rename legacy 'Information Technology & Software' -> 'Technology', else insert
  select id into v_tech_id
  from public.interview_industries
  where lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) = 'technology'
  limit 1;

  if v_tech_id is null then
    select id into v_old_it_id
    from public.interview_industries
    where lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) = 'information technology & software'
    limit 1;

    if v_old_it_id is not null then
      update public.interview_industries
      set
        name = 'Technology',
        description = 'Software engineering, web frontend, backend services, mobile development, and IT career readiness.',
        is_active = true
      where id = v_old_it_id;
      v_tech_id := v_old_it_id;
    else
      insert into public.interview_industries (name, description, is_active)
      values (
        'Technology',
        'Software engineering, web frontend, backend services, mobile development, and IT career readiness.',
        true
      )
      returning id into v_tech_id;
    end if;
  end if;

  -- Detach auto-seeded invented industries without touching existing questions or sessions
  update public.questions q
  set industry_id = case
    when lower(btrim(coalesce(q.category, ''))) = 'technical' then v_tech_id
    when q.industry_id in (
      select id from public.interview_industries
      where lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) in (
        'general career & ojt readiness',
        'data, analytics & cybersecurity'
      )
    ) then null
    else q.industry_id
  end;

  update public.interview_question_sets
  set industry_id = v_tech_id
  where industry_id in (
    select id from public.interview_industries
    where lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) in (
      'general career & ojt readiness',
      'data, analytics & cybersecurity'
    )
  );

  -- Remove unreferenced invented seed industries so Technology is the clean initial baseline
  delete from public.interview_industries ind
  where lower(btrim(regexp_replace(ind.name, '\s+', ' ', 'g'))) in (
    'general career & ojt readiness',
    'data, analytics & cybersecurity'
  )
    and not exists (select 1 from public.interview_job_roles jr where jr.industry_id = ind.id)
    and not exists (select 1 from public.interview_question_sets qs where qs.industry_id = ind.id)
    and not exists (select 1 from public.questions q where q.industry_id = ind.id)
    and not exists (select 1 from public.interview_sessions s where s.industry_id = ind.id);

  -- Upsert the 3 existing Android job roles under Technology
  insert into public.interview_job_roles (industry_id, name, description, difficulty_tiers, is_active)
  values
    (
      v_tech_id,
      'Frontend Developer',
      'Client-side user interfaces, HTML/CSS/JavaScript, modern web frameworks, responsiveness, and browser performance.',
      array['Easy', 'Medium', 'Hard']::text[],
      true
    ),
    (
      v_tech_id,
      'Backend Developer',
      'Server-side application logic, REST/API design, database modeling, authentication, caching, and system scalability.',
      array['Easy', 'Medium', 'Hard']::text[],
      true
    ),
    (
      v_tech_id,
      'Android Developer',
      'Native Android development with Kotlin/Java, Jetpack Compose/XML UI, lifecycle management, and mobile persistence.',
      array['Easy', 'Medium', 'Hard']::text[],
      true
    )
  on conflict (industry_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))))
  do update set
    description = coalesce(nullif(btrim(interview_job_roles.description), ''), excluded.description);

  select id into v_fe_id from public.interview_job_roles where industry_id = v_tech_id and lower(btrim(name)) = 'frontend developer' limit 1;
  select id into v_be_id from public.interview_job_roles where industry_id = v_tech_id and lower(btrim(name)) = 'backend developer' limit 1;
  select id into v_and_id from public.interview_job_roles where industry_id = v_tech_id and lower(btrim(name)) = 'android developer' limit 1;

  -- Link default sets cleanly for backward compatibility if queried
  insert into public.interview_job_role_question_sets (job_role_id, question_set_id)
  select jr_id, qs.id
  from (values (v_fe_id), (v_be_id), (v_and_id)) as roles(jr_id)
  cross join public.interview_question_sets qs
  where jr_id is not null and qs.status = 'active'
  on conflict (job_role_id, question_set_id) do nothing;
end $$;

-- 3. Allow Android client (anon + authenticated, matching public.questions) to read active industries & job roles
drop policy if exists "Students read active interview industries" on public.interview_industries;
create policy "Students read active interview industries"
  on public.interview_industries
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Students read active interview job roles" on public.interview_job_roles;
create policy "Students read active interview job roles"
  on public.interview_job_roles
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.interview_industries ind
      where ind.id = interview_job_roles.industry_id
        and ind.is_active = true
    )
  );

grant select on public.interview_industries to anon;
grant select on public.interview_job_roles to anon;

-- 4. Update active config RPC & add focused Android dropdown RPC
create or replace function public.get_active_industries_and_job_roles()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'industries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'description', i.description,
          'is_active', i.is_active
        ) order by i.name
      )
      from public.interview_industries i
      where i.is_active = true
    ), '[]'::jsonb),
    'job_roles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', jr.id,
          'industry_id', jr.industry_id,
          'industry_name', ind.name,
          'name', jr.name,
          'description', jr.description,
          'is_active', jr.is_active
        ) order by ind.name, jr.name
      )
      from public.interview_job_roles jr
      join public.interview_industries ind on ind.id = jr.industry_id
      where jr.is_active = true
        and ind.is_active = true
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_active_industries_and_job_roles() to anon, authenticated;
grant execute on function public.get_active_interview_mode_config() to anon, authenticated;
