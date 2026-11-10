alter table public.questions
  add column if not exists ideal_answer text;

alter table public.questions
  add column if not exists job_role text;

alter table public.questions
  add column if not exists is_active boolean not null default true;

notify pgrst, 'reload schema';
