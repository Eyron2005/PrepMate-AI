-- Admin-Managed Interview Mode Configuration Schema, RLS, Deletion Guards, Seeding, and Backfill

create table if not exists public.interview_industries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists interview_industries_name_unique_idx
  on public.interview_industries (lower(btrim(name)));

create table if not exists public.interview_difficulty_tiers (
  code text primary key check (code in ('Easy', 'Medium', 'Hard')),
  name text not null unique check (name in ('Easy', 'Medium', 'Hard')),
  level_code text not null unique check (level_code in ('EASY', 'MEDIUM', 'HARD')),
  description text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_question_sets (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references public.interview_industries(id) on delete restrict,
  name text not null,
  description text,
  categories text[] not null default array['HR', 'Technical', 'Behavioral', 'Situational']::text[],
  question_count integer not null default 5 check (question_count >= 1 and question_count <= 50),
  difficulty_tiers text[] not null default array['Easy', 'Medium', 'Hard']::text[],
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_question_sets_categories_valid check (
    coalesce(array_length(categories, 1), 0) >= 1
    and categories <@ array['HR', 'Technical', 'Behavioral', 'Situational']::text[]
  ),
  constraint interview_question_sets_difficulties_valid check (
    coalesce(array_length(difficulty_tiers, 1), 0) >= 1
    and difficulty_tiers <@ array['Easy', 'Medium', 'Hard']::text[]
  )
);

create unique index if not exists interview_question_sets_industry_name_unique_idx
  on public.interview_question_sets (industry_id, lower(btrim(name)));

create table if not exists public.interview_job_roles (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references public.interview_industries(id) on delete restrict,
  name text not null,
  description text,
  difficulty_tiers text[] not null default array['Easy', 'Medium', 'Hard']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_job_roles_difficulties_valid check (
    coalesce(array_length(difficulty_tiers, 1), 0) >= 1
    and difficulty_tiers <@ array['Easy', 'Medium', 'Hard']::text[]
  )
);

create unique index if not exists interview_job_roles_industry_name_unique_idx
  on public.interview_job_roles (industry_id, lower(btrim(name)));

create table if not exists public.interview_job_role_question_sets (
  id uuid primary key default gen_random_uuid(),
  job_role_id uuid not null references public.interview_job_roles(id) on delete cascade,
  question_set_id uuid not null references public.interview_question_sets(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_role_id, question_set_id)
);

create table if not exists public.interview_question_set_questions (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid not null references public.interview_question_sets(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (question_set_id, question_id)
);

-- Extend existing questions table with relational references while keeping legacy columns compatible
alter table public.questions
  add column if not exists industry_id uuid references public.interview_industries(id) on delete restrict,
  add column if not exists question_set_id uuid references public.interview_question_sets(id) on delete restrict,
  add column if not exists job_role_id uuid references public.interview_job_roles(id) on delete restrict,
  add column if not exists difficulty_code text references public.interview_difficulty_tiers(code) on delete restrict;

create index if not exists questions_industry_id_idx on public.questions (industry_id);
create index if not exists questions_question_set_id_idx on public.questions (question_set_id);
create index if not exists questions_job_role_id_idx on public.questions (job_role_id);

-- Extend existing interview_sessions table to preserve configuration snapshots & enforce RESTRICT on delete
alter table public.interview_sessions
  add column if not exists industry_id uuid references public.interview_industries(id) on delete restrict,
  add column if not exists question_set_id uuid references public.interview_question_sets(id) on delete restrict,
  add column if not exists job_role_id uuid references public.interview_job_roles(id) on delete restrict,
  add column if not exists difficulty text references public.interview_difficulty_tiers(code) on delete restrict,
  add column if not exists industry_name text,
  add column if not exists question_set_name text,
  add column if not exists job_role_name text;

-- Triggers to keep updated_at and question_set active status synchronized cleanly
create or replace function public.sync_interview_config_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
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
  before update on public.interview_industries
  for each row execute function public.sync_interview_config_timestamps();

drop trigger if exists trg_interview_difficulty_tiers_updated_at on public.interview_difficulty_tiers;
create trigger trg_interview_difficulty_tiers_updated_at
  before update on public.interview_difficulty_tiers
  for each row execute function public.sync_interview_config_timestamps();

drop trigger if exists trg_interview_question_sets_sync on public.interview_question_sets;
create trigger trg_interview_question_sets_sync
  before insert or update on public.interview_question_sets
  for each row execute function public.sync_interview_config_timestamps();

drop trigger if exists trg_interview_job_roles_updated_at on public.interview_job_roles;
create trigger trg_interview_job_roles_updated_at
  before update on public.interview_job_roles
  for each row execute function public.sync_interview_config_timestamps();

-- Prevent deleting Interview Mode configs if referenced by questions, sessions, or child mappings
create or replace function public.guard_interview_config_delete()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'interview_industries' then
    if exists (select 1 from public.interview_question_sets where industry_id = old.id)
      or exists (select 1 from public.interview_job_roles where industry_id = old.id)
      or exists (select 1 from public.questions where industry_id = old.id)
      or exists (select 1 from public.interview_sessions where industry_id = old.id)
    then
      raise exception 'Industry "%" is referenced by existing configurations, questions, or sessions. Deactivate it instead.', old.name;
    end if;
  elsif tg_table_name = 'interview_question_sets' then
    if exists (select 1 from public.questions where question_set_id = old.id)
      or exists (select 1 from public.interview_question_set_questions where question_set_id = old.id)
      or exists (select 1 from public.interview_sessions where question_set_id = old.id)
    then
      raise exception 'Question set "%" is referenced by existing questions or sessions. Deactivate or archive it instead.', old.name;
    end if;
  elsif tg_table_name = 'interview_job_roles' then
    if exists (select 1 from public.questions where job_role_id = old.id)
      or exists (select 1 from public.interview_sessions where job_role_id = old.id)
    then
      raise exception 'Job role "%" is referenced by existing questions or sessions. Deactivate it instead.', old.name;
    end if;
  elsif tg_table_name = 'interview_difficulty_tiers' then
    raise exception 'Default difficulty tiers cannot be deleted. Deactivate them instead.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_guard_industry_delete on public.interview_industries;
create trigger trg_guard_industry_delete
  before delete on public.interview_industries
  for each row execute function public.guard_interview_config_delete();

drop trigger if exists trg_guard_question_set_delete on public.interview_question_sets;
create trigger trg_guard_question_set_delete
  before delete on public.interview_question_sets
  for each row execute function public.guard_interview_config_delete();

drop trigger if exists trg_guard_job_role_delete on public.interview_job_roles;
create trigger trg_guard_job_role_delete
  before delete on public.interview_job_roles
  for each row execute function public.guard_interview_config_delete();

drop trigger if exists trg_guard_difficulty_delete on public.interview_difficulty_tiers;
create trigger trg_guard_difficulty_delete
  before delete on public.interview_difficulty_tiers
  for each row execute function public.guard_interview_config_delete();

-- Seed default difficulty tiers (Easy, Medium, Hard only)
insert into public.interview_difficulty_tiers (code, name, level_code, description, sort_order, is_active)
values
  ('Easy', 'Easy', 'EASY', 'Foundational questions testing core definitions, personal background, and straightforward workplace concepts.', 1, true),
  ('Medium', 'Medium', 'MEDIUM', 'Applied interview prompts requiring structured reasoning, real examples, and practical problem-solving.', 2, true),
  ('Hard', 'Hard', 'HARD', 'Complex technical or scenario-based prompts evaluating trade-offs, system design, and leadership decisions.', 3, true)
on conflict (code) do nothing;

-- Seed initial Industries and Question Sets aligned with existing Question Bank records
do $$
declare
  v_ind_general uuid;
  v_ind_it uuid;
  v_ind_data uuid;
  v_set_hr uuid;
  v_set_behavioral uuid;
  v_set_situational uuid;
  v_set_technical uuid;
  v_role_ojt uuid;
  v_role_hr_intern uuid;
  v_role_swe uuid;
  v_role_web uuid;
  v_role_qa uuid;
  v_role_data uuid;
  v_role_sec uuid;
begin
  insert into public.interview_industries (name, description, is_active)
  values
    ('General Career & OJT Readiness', 'Core HR, workplace communication, and internship readiness across all disciplines.', true),
    ('Information Technology & Software', 'Software development, web engineering, software testing, and IT support roles.', true),
    ('Data, Analytics & Cybersecurity', 'Data analysis, database engineering, business intelligence, and cybersecurity operations.', true)
  on conflict (lower(btrim(name))) do nothing;

  select id into v_ind_general from public.interview_industries where lower(btrim(name)) = 'general career & ojt readiness' limit 1;
  select id into v_ind_it from public.interview_industries where lower(btrim(name)) = 'information technology & software' limit 1;
  select id into v_ind_data from public.interview_industries where lower(btrim(name)) = 'data, analytics & cybersecurity' limit 1;

  insert into public.interview_question_sets (industry_id, name, description, categories, question_count, difficulty_tiers, status, is_active)
  values
    (v_ind_general, 'HR Questions', 'Core HR screening questions evaluating self-awareness, career motivation, and professionalism.', array['HR']::text[], 5, array['Easy', 'Medium', 'Hard']::text[], 'active', true),
    (v_ind_general, 'Behavioral', 'STAR-format behavioral questions covering teamwork, adaptability, leadership, and accountability.', array['Behavioral']::text[], 5, array['Easy', 'Medium', 'Hard']::text[], 'active', true),
    (v_ind_general, 'Situational', 'Workplace dilemma and prioritization scenarios measuring practical judgment and ethics.', array['Situational']::text[], 5, array['Easy', 'Medium', 'Hard']::text[], 'active', true),
    (v_ind_it, 'Technical', 'Foundational and applied technical questions covering programming, databases, networking, and testing.', array['Technical']::text[], 5, array['Easy', 'Medium', 'Hard']::text[], 'active', true)
  on conflict (industry_id, lower(btrim(name))) do nothing;

  select id into v_set_hr from public.interview_question_sets where industry_id = v_ind_general and lower(btrim(name)) = 'hr questions' limit 1;
  select id into v_set_behavioral from public.interview_question_sets where industry_id = v_ind_general and lower(btrim(name)) = 'behavioral' limit 1;
  select id into v_set_situational from public.interview_question_sets where industry_id = v_ind_general and lower(btrim(name)) = 'situational' limit 1;
  select id into v_set_technical from public.interview_question_sets where industry_id = v_ind_it and lower(btrim(name)) = 'technical' limit 1;

  insert into public.interview_job_roles (industry_id, name, description, difficulty_tiers, is_active)
  values
    (v_ind_general, 'General / Entry-Level Candidate', 'Entry-level graduate or college internship applicant.', array['Easy', 'Medium', 'Hard']::text[], true),
    (v_ind_general, 'Operations & HR Coordinator', 'Entry-level human resources, recruitment, or administrative operations intern.', array['Easy', 'Medium']::text[], true),
    (v_ind_it, 'Software Engineer / Developer', 'Full-stack, backend, or application developer focusing on software design and debugging.', array['Easy', 'Medium', 'Hard']::text[], true),
    (v_ind_it, 'Web Developer', 'Frontend and web application engineer building responsive user interfaces and APIs.', array['Easy', 'Medium', 'Hard']::text[], true),
    (v_ind_it, 'QA / Software Tester', 'Quality assurance engineer focused on test planning, verification, and defect reporting.', array['Easy', 'Medium']::text[], true),
    (v_ind_data, 'Data Analyst', 'Junior analyst working with SQL queries, data cleaning, reporting, and KPI interpretation.', array['Easy', 'Medium', 'Hard']::text[], true),
    (v_ind_data, 'Cybersecurity Analyst', 'Entry-level security analyst focused on vulnerability hygiene, authentication, and network safety.', array['Medium', 'Hard']::text[], true)
  on conflict (industry_id, lower(btrim(name))) do nothing;

  select id into v_role_ojt from public.interview_job_roles where industry_id = v_ind_general and lower(btrim(name)) = 'general / entry-level candidate' limit 1;
  select id into v_role_hr_intern from public.interview_job_roles where industry_id = v_ind_general and lower(btrim(name)) = 'operations & hr coordinator' limit 1;
  select id into v_role_swe from public.interview_job_roles where industry_id = v_ind_it and lower(btrim(name)) = 'software engineer / developer' limit 1;
  select id into v_role_web from public.interview_job_roles where industry_id = v_ind_it and lower(btrim(name)) = 'web developer' limit 1;
  select id into v_role_qa from public.interview_job_roles where industry_id = v_ind_it and lower(btrim(name)) = 'qa / software tester' limit 1;
  select id into v_role_data from public.interview_job_roles where industry_id = v_ind_data and lower(btrim(name)) = 'data analyst' limit 1;
  select id into v_role_sec from public.interview_job_roles where industry_id = v_ind_data and lower(btrim(name)) = 'cybersecurity analyst' limit 1;

  insert into public.interview_job_role_question_sets (job_role_id, question_set_id)
  values
    (v_role_ojt, v_set_hr),
    (v_role_ojt, v_set_behavioral),
    (v_role_ojt, v_set_situational),
    (v_role_hr_intern, v_set_hr),
    (v_role_hr_intern, v_set_behavioral),
    (v_role_swe, v_set_technical),
    (v_role_swe, v_set_behavioral),
    (v_role_web, v_set_technical),
    (v_role_web, v_set_situational),
    (v_role_qa, v_set_technical),
    (v_role_qa, v_set_situational),
    (v_role_data, v_set_technical),
    (v_role_sec, v_set_technical)
  on conflict (job_role_id, question_set_id) do nothing;

  -- Backfill existing questions cleanly to their matching Question Set, Industry, and Difficulty Code
  update public.questions q
  set
    difficulty_code = case lower(btrim(coalesce(q.difficulty, '')))
      when 'easy' then 'Easy'
      when 'medium' then 'Medium'
      when 'hard' then 'Hard'
      else 'Medium'
    end,
    question_set_id = coalesce(
      q.question_set_id,
      case
        when lower(btrim(coalesce(q.question_set, q.category, ''))) in ('hr questions', 'hr') then v_set_hr
        when lower(btrim(coalesce(q.question_set, q.category, ''))) in ('behavioral', 'behavioral questions') then v_set_behavioral
        when lower(btrim(coalesce(q.question_set, q.category, ''))) in ('situational', 'situational questions') then v_set_situational
        when lower(btrim(coalesce(q.question_set, q.category, ''))) in ('technical', 'technical questions') then v_set_technical
        else v_set_hr
      end
    ),
    industry_id = coalesce(
      q.industry_id,
      case
        when lower(btrim(coalesce(q.question_set, q.category, ''))) in ('technical', 'technical questions') then v_ind_it
        else v_ind_general
      end
    ),
    question_set = coalesce(
      nullif(btrim(q.question_set), ''),
      case
        when lower(btrim(coalesce(q.category, ''))) = 'hr' then 'HR Questions'
        when lower(btrim(coalesce(q.category, ''))) = 'behavioral' then 'Behavioral'
        when lower(btrim(coalesce(q.category, ''))) = 'situational' then 'Situational'
        when lower(btrim(coalesce(q.category, ''))) = 'technical' then 'Technical'
        else 'HR Questions'
      end
    );

  insert into public.interview_question_set_questions (question_set_id, question_id)
  select q.question_set_id, q.id
  from public.questions q
  where q.question_set_id is not null
  on conflict (question_set_id, question_id) do nothing;
end;
$$;

-- Enable Row Level Security & Authoritative Policies across all Interview Mode tables
alter table public.interview_industries enable row level security;
alter table public.interview_difficulty_tiers enable row level security;
alter table public.interview_question_sets enable row level security;
alter table public.interview_job_roles enable row level security;
alter table public.interview_job_role_question_sets enable row level security;
alter table public.interview_question_set_questions enable row level security;

-- Industries RLS
drop policy if exists "Admins manage interview industries" on public.interview_industries;
create policy "Admins manage interview industries"
  on public.interview_industries
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Staff view interview industries" on public.interview_industries;
create policy "Staff view interview industries"
  on public.interview_industries
  for select
  to authenticated
  using (public.is_current_user_staff());

drop policy if exists "Students read active interview industries" on public.interview_industries;
create policy "Students read active interview industries"
  on public.interview_industries
  for select
  to authenticated
  using (is_active = true);

-- Difficulty Tiers RLS (Admin SELECT + UPDATE only; NO INSERT or DELETE to prohibit duplicates)
drop policy if exists "Admins view interview difficulty tiers" on public.interview_difficulty_tiers;
create policy "Admins view interview difficulty tiers"
  on public.interview_difficulty_tiers
  for select
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists "Admins update interview difficulty tiers" on public.interview_difficulty_tiers;
create policy "Admins update interview difficulty tiers"
  on public.interview_difficulty_tiers
  for update
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Staff view interview difficulty tiers" on public.interview_difficulty_tiers;
create policy "Staff view interview difficulty tiers"
  on public.interview_difficulty_tiers
  for select
  to authenticated
  using (public.is_current_user_staff());

drop policy if exists "Students read active interview difficulty tiers" on public.interview_difficulty_tiers;
create policy "Students read active interview difficulty tiers"
  on public.interview_difficulty_tiers
  for select
  to authenticated
  using (is_active = true);

-- Question Sets RLS
drop policy if exists "Admins manage interview question sets" on public.interview_question_sets;
create policy "Admins manage interview question sets"
  on public.interview_question_sets
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Staff view interview question sets" on public.interview_question_sets;
create policy "Staff view interview question sets"
  on public.interview_question_sets
  for select
  to authenticated
  using (public.is_current_user_staff());

drop policy if exists "Students read active interview question sets" on public.interview_question_sets;
create policy "Students read active interview question sets"
  on public.interview_question_sets
  for select
  to authenticated
  using (
    status = 'active'
    and is_active = true
    and exists (
      select 1 from public.interview_industries ind
      where ind.id = interview_question_sets.industry_id
        and ind.is_active = true
    )
  );

-- Job Roles RLS
drop policy if exists "Admins manage interview job roles" on public.interview_job_roles;
create policy "Admins manage interview job roles"
  on public.interview_job_roles
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Staff view interview job roles" on public.interview_job_roles;
create policy "Staff view interview job roles"
  on public.interview_job_roles
  for select
  to authenticated
  using (public.is_current_user_staff());

drop policy if exists "Students read active interview job roles" on public.interview_job_roles;
create policy "Students read active interview job roles"
  on public.interview_job_roles
  for select
  to authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.interview_industries ind
      where ind.id = interview_job_roles.industry_id
        and ind.is_active = true
    )
  );

-- Job Role <-> Question Set Links RLS
drop policy if exists "Admins manage job role question set links" on public.interview_job_role_question_sets;
create policy "Admins manage job role question set links"
  on public.interview_job_role_question_sets
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Staff view job role question set links" on public.interview_job_role_question_sets;
create policy "Staff view job role question set links"
  on public.interview_job_role_question_sets
  for select
  to authenticated
  using (public.is_current_user_staff());

drop policy if exists "Authenticated read active job role question set links" on public.interview_job_role_question_sets;
create policy "Authenticated read active job role question set links"
  on public.interview_job_role_question_sets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.interview_job_roles jr
      join public.interview_industries ind on ind.id = jr.industry_id
      where jr.id = interview_job_role_question_sets.job_role_id
        and jr.is_active = true
        and ind.is_active = true
    )
    and exists (
      select 1 from public.interview_question_sets qs
      where qs.id = interview_job_role_question_sets.question_set_id
        and qs.status = 'active'
        and qs.is_active = true
    )
  );

-- Question Set <-> Questions Links RLS
drop policy if exists "Admins manage question set question links" on public.interview_question_set_questions;
create policy "Admins manage question set question links"
  on public.interview_question_set_questions
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Staff view question set question links" on public.interview_question_set_questions;
create policy "Staff view question set question links"
  on public.interview_question_set_questions
  for select
  to authenticated
  using (public.is_current_user_staff());

drop policy if exists "Students read active question set question links" on public.interview_question_set_questions;
create policy "Students read active question set question links"
  on public.interview_question_set_questions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.interview_question_sets qs
      join public.interview_industries ind on ind.id = qs.industry_id
      where qs.id = interview_question_set_questions.question_set_id
        and qs.status = 'active'
        and qs.is_active = true
        and ind.is_active = true
    )
    and exists (
      select 1 from public.questions q
      where q.id = interview_question_set_questions.question_id
        and q.is_active = true
    )
  );

-- Grants for authenticated users (controlled by RLS)
grant select, insert, update, delete on public.interview_industries to authenticated;
grant select, update on public.interview_difficulty_tiers to authenticated;
grant select, insert, update, delete on public.interview_question_sets to authenticated;
grant select, insert, update, delete on public.interview_job_roles to authenticated;
grant select, insert, update, delete on public.interview_job_role_question_sets to authenticated;
grant select, insert, update, delete on public.interview_question_set_questions to authenticated;

-- Centralized RPC returning currently active Interview Mode configuration for mobile / Android setup
create or replace function public.get_active_interview_mode_config()
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
    'question_sets', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qs.id,
          'industry_id', qs.industry_id,
          'name', qs.name,
          'description', qs.description,
          'categories', qs.categories,
          'question_count', qs.question_count,
          'difficulty_tiers', coalesce((
            select array_agg(t order by dt.sort_order)
            from unnest(qs.difficulty_tiers) as t
            join public.interview_difficulty_tiers dt on dt.code = t
            where dt.is_active = true
          ), array[]::text[]),
          'question_ids', coalesce((
            select array_agg(qsq.question_id order by qsq.sort_order, qsq.created_at)
            from public.interview_question_set_questions qsq
            join public.questions q on q.id = qsq.question_id
            where qsq.question_set_id = qs.id
              and q.is_active = true
          ), array[]::uuid[])
        ) order by qs.name
      )
      from public.interview_question_sets qs
      join public.interview_industries ind on ind.id = qs.industry_id
      where qs.status = 'active'
        and qs.is_active = true
        and ind.is_active = true
    ), '[]'::jsonb),
    'job_roles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', jr.id,
          'industry_id', jr.industry_id,
          'name', jr.name,
          'description', jr.description,
          'difficulty_tiers', coalesce((
            select array_agg(t order by dt.sort_order)
            from unnest(jr.difficulty_tiers) as t
            join public.interview_difficulty_tiers dt on dt.code = t
            where dt.is_active = true
          ), array[]::text[]),
          'question_set_ids', coalesce((
            select array_agg(jqs.question_set_id)
            from public.interview_job_role_question_sets jqs
            join public.interview_question_sets qs on qs.id = jqs.question_set_id
            where jqs.job_role_id = jr.id
              and qs.status = 'active'
              and qs.is_active = true
          ), array[]::uuid[])
        ) order by jr.name
      )
      from public.interview_job_roles jr
      join public.interview_industries ind on ind.id = jr.industry_id
      where jr.is_active = true
        and ind.is_active = true
    ), '[]'::jsonb),
    'difficulty_tiers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', dt.code,
          'name', dt.name,
          'level_code', dt.level_code,
          'description', dt.description,
          'sort_order', dt.sort_order,
          'is_active', dt.is_active
        ) order by dt.sort_order
      )
      from public.interview_difficulty_tiers dt
      where dt.is_active = true
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_active_interview_mode_config() from public;
revoke all on function public.get_active_interview_mode_config() from anon;
grant execute on function public.get_active_interview_mode_config() to authenticated;

notify pgrst, 'reload schema';
