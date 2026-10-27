do $$
begin
  if to_regclass('public.system_settings') is not null then
    drop policy if exists "Admins manage system settings" on public.system_settings;
    drop policy if exists "Staff read limited system settings" on public.system_settings;
    drop table if exists public.system_settings cascade;
  end if;
end $$;
