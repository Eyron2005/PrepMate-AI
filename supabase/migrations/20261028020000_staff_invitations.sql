alter table public.staff
  add column if not exists is_active boolean not null default true;

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  invited_email text not null,
  full_name text not null,
  department text,
  position text,
  inviter_id uuid references auth.users(id) on delete set null,
  invited_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  account_created boolean not null default false,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_invitations
  add column if not exists staff_id uuid references public.staff(id) on delete set null;

create unique index if not exists staff_invitations_one_pending_per_email_idx
  on public.staff_invitations (lower(invited_email))
  where status = 'pending';

create unique index if not exists staff_invitations_invited_user_id_idx
  on public.staff_invitations (invited_user_id)
  where invited_user_id is not null;

alter table public.staff_invitations enable row level security;
revoke all on public.staff_invitations from anon, authenticated;
grant all on public.staff_invitations to service_role;

create or replace function public.staff_invitation_auth_user_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    where lower(auth_user.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.staff_invitation_auth_user_exists(text) from public;
revoke all on function public.staff_invitation_auth_user_exists(text) from anon;
revoke all on function public.staff_invitation_auth_user_exists(text) from authenticated;
grant execute on function public.staff_invitation_auth_user_exists(text) to service_role;

create or replace function public.create_staff_invitation(
  p_user_id uuid,
  p_invited_by uuid,
  p_email text,
  p_full_name text,
  p_department text,
  p_position text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_staff_id uuid;
  auth_email text;
begin
  if not exists (
    select 1
    from public.admins as admin
    where admin.id = p_invited_by
      and coalesce(admin.is_active, true)
  ) then
    raise exception 'An active administrator is required to invite staff';
  end if;

  if exists (
    select 1
    from public.staff as staff_member
    where lower(staff_member.email) = lower(p_email)
  ) then
    raise exception 'A staff profile with this email already exists';
  end if;

  select lower(auth_user.email)
    into auth_email
  from auth.users as auth_user
  where auth_user.id = p_user_id;

  if auth_email is null or auth_email <> lower(p_email) then
    raise exception 'The invited Auth account does not match the invitation email';
  end if;

  insert into public.staff (id, full_name, email, department, position, is_active)
  values (p_user_id, p_full_name, lower(p_email), nullif(p_department, ''), nullif(p_position, ''), false)
  returning id into new_staff_id;

  insert into public.staff_invitations (
    invited_email,
    full_name,
    department,
    position,
    inviter_id,
    invited_user_id,
    status,
    account_created,
    staff_id,
    expires_at
  )
  values (
    lower(p_email),
    p_full_name,
    nullif(p_department, ''),
    nullif(p_position, ''),
    p_invited_by,
    p_user_id,
    'pending',
    true,
    new_staff_id,
    now() + interval '1 hour'
  );

  return new_staff_id;
end;
$$;

revoke all on function public.create_staff_invitation(uuid, uuid, text, text, text, text) from public;
revoke all on function public.create_staff_invitation(uuid, uuid, text, text, text, text) from anon;
revoke all on function public.create_staff_invitation(uuid, uuid, text, text, text, text) from authenticated;
grant execute on function public.create_staff_invitation(uuid, uuid, text, text, text, text) to service_role;

create or replace function public.accept_staff_invitation()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  verified_at timestamptz;
  invitation public.staff_invitations%rowtype;
  updated_count integer;
begin
  if current_user_id is null then
    raise exception 'A signed-in user is required to accept a staff invitation';
  end if;

  select lower(auth_user.email), auth_user.email_confirmed_at
    into current_email, verified_at
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  if current_email is null or verified_at is null then
    raise exception 'The invited email address must be verified before accepting';
  end if;

  select *
    into invitation
  from public.staff_invitations
  where invited_user_id = current_user_id
  for update;

  if not found then
    raise exception 'No staff invitation was found for this account';
  end if;

  if invitation.status = 'accepted' then
    return 'already_accepted';
  end if;
  if invitation.status = 'revoked' then
    return 'revoked';
  end if;
  if invitation.status <> 'pending' or invitation.expires_at <= now() then
    update public.staff_invitations
      set status = 'expired',
          updated_at = now()
    where id = invitation.id;
    return 'expired';
  end if;
  if lower(invitation.invited_email) <> current_email then
    raise exception 'The signed-in email does not match the invited email';
  end if;

  update public.staff
    set is_active = true
  where id = invitation.staff_id
    and id = current_user_id
    and lower(email) = current_email
    and is_active is false;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'The staff profile could not be activated';
  end if;

  update public.staff_invitations
    set status = 'accepted',
        accepted_at = now(),
        updated_at = now()
  where id = invitation.id;

  return 'accepted';
end;
$$;

revoke all on function public.accept_staff_invitation() from public;
revoke all on function public.accept_staff_invitation() from anon;
grant execute on function public.accept_staff_invitation() to authenticated;

create or replace function public.get_staff_invitation_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  verified_at timestamptz;
  invitation public.staff_invitations%rowtype;
  invitation_status text;
begin
  if current_user_id is null then
    raise exception 'A signed-in user is required to view a staff invitation';
  end if;

  select lower(auth_user.email), auth_user.email_confirmed_at
    into current_email, verified_at
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  select *
    into invitation
  from public.staff_invitations
  where invited_user_id = current_user_id;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  invitation_status := invitation.status;
  if invitation_status = 'pending' and invitation.expires_at <= now() then
    invitation_status := 'expired';
  elsif invitation_status = 'pending' and lower(invitation.invited_email) <> coalesce(current_email, '') then
    invitation_status := 'email_mismatch';
  elsif invitation_status = 'pending' and verified_at is null then
    invitation_status := 'email_unverified';
  end if;

  if invitation_status <> 'pending' then
    return jsonb_build_object('status', invitation_status);
  end if;

  return jsonb_build_object(
    'status', 'pending',
    'email', invitation.invited_email,
    'full_name', invitation.full_name,
    'position', invitation.position,
    'department', invitation.department,
    'expires_at', invitation.expires_at
  );
end;
$$;

revoke all on function public.get_staff_invitation_status() from public;
revoke all on function public.get_staff_invitation_status() from anon;
grant execute on function public.get_staff_invitation_status() to authenticated;

notify pgrst, 'reload schema';
