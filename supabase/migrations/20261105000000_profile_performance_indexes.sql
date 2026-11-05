create index if not exists profiles_created_at_id_desc_idx
  on public.profiles (created_at desc, id desc);

create index if not exists profiles_last_online_desc_idx
  on public.profiles (last_online desc)
  where last_online is not null;
