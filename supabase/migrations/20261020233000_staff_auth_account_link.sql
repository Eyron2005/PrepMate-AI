alter table public.staff
  alter column id drop default;

notify pgrst, 'reload schema';
