-- Migration: Synchronize profile email from auth.users and align RPC signatures
-- Date: 2026-11-08

-- 1. Ensure email column exists on public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- 2. Backfill email for all existing profiles from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE (p.id = u.id OR p.auth_user_id = u.id)
  AND (p.email IS NULL OR p.email <> u.email);

-- 3. Create or replace trigger to keep profiles.email in sync with auth.users
CREATE OR REPLACE FUNCTION public.handle_profile_email_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id OR auth_user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_email_sync();

-- 4. Drop existing function signatures to avoid return type mismatch
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_email(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_email(text, text, int, int);
DROP FUNCTION IF EXISTS public.get_admin_profiles_count(text, text);

-- 5. Create RPC function with exact parameter names expected by Supabase JS client
CREATE OR REPLACE FUNCTION public.get_admin_profiles_with_email(
  search_term text DEFAULT NULL,
  status_filter text DEFAULT 'all',
  page_limit int DEFAULT 50,
  page_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  auth_user_id uuid,
  full_name text,
  email text,
  account_status text,
  deactivation_reason text,
  deactivation_details text,
  deactivated_at timestamptz,
  deactivated_by uuid,
  created_at timestamptz,
  last_online timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.auth_user_id,
    p.full_name,
    COALESCE(u.email::text, p.email),
    COALESCE(p.account_status, 'active'),
    p.deactivation_reason,
    p.deactivation_details,
    p.deactivated_at,
    p.deactivated_by,
    p.created_at,
    p.last_online
  FROM public.profiles p
  LEFT JOIN auth.users u ON (p.id = u.id OR p.auth_user_id = u.id)
  WHERE (
    search_term IS NULL
    OR search_term = ''
    OR p.full_name ILIKE '%' || search_term || '%'
    OR COALESCE(u.email::text, p.email) ILIKE '%' || search_term || '%'
  )
  AND (
    status_filter IS NULL
    OR status_filter = 'all'
    OR (status_filter = 'active' AND COALESCE(p.account_status, 'active') = 'active')
    OR (status_filter = 'deactivated' AND p.account_status = 'deactivated')
  )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT page_limit OFFSET page_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_profiles_with_email(text, text, int, int) TO authenticated;

-- Count RPC function with matching parameter names
CREATE OR REPLACE FUNCTION public.get_admin_profiles_count(
  search_term text DEFAULT NULL,
  status_filter text DEFAULT 'all'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.profiles p
  LEFT JOIN auth.users u ON (p.id = u.id OR p.auth_user_id = u.id)
  WHERE (
    search_term IS NULL
    OR search_term = ''
    OR p.full_name ILIKE '%' || search_term || '%'
    OR COALESCE(u.email::text, p.email) ILIKE '%' || search_term || '%'
  )
  AND (
    status_filter IS NULL
    OR status_filter = 'all'
    OR (status_filter = 'active' AND COALESCE(p.account_status, 'active') = 'active')
    OR (status_filter = 'deactivated' AND p.account_status = 'deactivated')
  );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_profiles_count(text, text) TO authenticated;
