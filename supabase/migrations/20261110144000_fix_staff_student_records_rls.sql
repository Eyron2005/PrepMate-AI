-- Migration: Remove permissive public/authenticated SELECT policies on public.profiles
-- Ensures staff supervisors can only view student profiles assigned to them in staff_student_assignments.
-- Date: 2026-11-10

-- 1. Drop overly permissive legacy SELECT policies that bypassed role-scoped assignment RLS
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or public profiles" ON public.profiles;

-- 2. Re-affirm role-scoped SELECT policies on public.profiles
DROP POLICY IF EXISTS "Assigned staff read student profiles" ON public.profiles;
CREATE POLICY "Assigned staff read student profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.staff_can_view_student(id)
    OR (auth_user_id IS NOT NULL AND public.staff_can_view_student(auth_user_id))
  );

-- 3. Sync any missing profile emails from auth.users (e.g., profiles created after auth user insert)
UPDATE public.profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE u.id = COALESCE(p.auth_user_id, p.id)
  AND u.email IS NOT NULL
  AND p.email IS DISTINCT FROM u.email;

CREATE OR REPLACE FUNCTION public.fill_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_email text;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    SELECT u.email INTO v_auth_email
    FROM auth.users AS u
    WHERE u.id = COALESCE(NEW.auth_user_id, NEW.id);

    IF v_auth_email IS NOT NULL THEN
      NEW.email := v_auth_email;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_profile_insert_fill_email ON public.profiles;
CREATE TRIGGER before_profile_insert_fill_email
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_profile_email_from_auth();

NOTIFY pgrst, 'reload schema';
