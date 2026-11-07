-- Migration: Account Deactivation and Reactivation Management
-- Target: Supabase project gfwlgojgpotnpmhtdrtz

-- 1. Extend profiles with account_status and deactivation metadata
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deactivation_reason text,
  ADD COLUMN IF NOT EXISTS deactivation_details text,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivation_agreed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deactivation_agreed_at timestamptz;

-- Add check constraint for account_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'deactivated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_account_status_idx
  ON public.profiles (account_status);

-- 2. Helper function to check if student account is active
CREATE OR REPLACE FUNCTION public.is_student_active(target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = target_id
      AND p.account_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_student_active(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_student_active(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_student_active(uuid) TO authenticated;

-- 3. Create account_reactivation_requests table
CREATE TABLE IF NOT EXISTS public.account_reactivation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  registered_email text,
  reactivation_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_remarks text,
  email_verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS account_reactivation_requests_user_id_idx
  ON public.account_reactivation_requests (user_id);

CREATE INDEX IF NOT EXISTS account_reactivation_requests_status_idx
  ON public.account_reactivation_requests (status);

CREATE INDEX IF NOT EXISTS account_reactivation_requests_submitted_at_idx
  ON public.account_reactivation_requests (submitted_at DESC);

-- Prevent duplicate pending requests for the same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_pending_request
  ON public.account_reactivation_requests (user_id)
  WHERE status = 'pending';

ALTER TABLE public.account_reactivation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage reactivation requests" ON public.account_reactivation_requests;
CREATE POLICY "Admins manage reactivation requests"
  ON public.account_reactivation_requests
  FOR ALL
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Users view their own reactivation requests" ON public.account_reactivation_requests;
CREATE POLICY "Users view their own reactivation requests"
  ON public.account_reactivation_requests
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 4. Create account_management_audit_logs table
CREATE TABLE IF NOT EXISTS public.account_management_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_status text,
  new_status text,
  performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  performer_role text NOT NULL DEFAULT 'admin',
  reason text,
  admin_remarks text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_audit_logs_user_id_idx
  ON public.account_management_audit_logs (user_id);

CREATE INDEX IF NOT EXISTS account_audit_logs_created_at_idx
  ON public.account_management_audit_logs (created_at DESC);

ALTER TABLE public.account_management_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view audit logs" ON public.account_management_audit_logs;
CREATE POLICY "Admins view audit logs"
  ON public.account_management_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

-- 5. Database-level deactivation enforcement on interview data
DROP POLICY IF EXISTS "Users create their own interview results" ON public.interview_results;
CREATE POLICY "Users create their own interview results"
  ON public.interview_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  );

DROP POLICY IF EXISTS "Users read their own interview results" ON public.interview_results;
CREATE POLICY "Users read their own interview results"
  ON public.interview_results
  FOR SELECT
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  );

DROP POLICY IF EXISTS "Users update their own interview results" ON public.interview_results;
CREATE POLICY "Users update their own interview results"
  ON public.interview_results
  FOR UPDATE
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  )
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  );

DROP POLICY IF EXISTS "Users create their own interview sessions" ON public.interview_sessions;
CREATE POLICY "Users create their own interview sessions"
  ON public.interview_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  );

DROP POLICY IF EXISTS "Users read their own interview sessions" ON public.interview_sessions;
CREATE POLICY "Users read their own interview sessions"
  ON public.interview_sessions
  FOR SELECT
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  );

DROP POLICY IF EXISTS "Users update their own interview sessions" ON public.interview_sessions;
CREATE POLICY "Users update their own interview sessions"
  ON public.interview_sessions
  FOR UPDATE
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  )
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND public.is_student_active(profile_id)
  );

-- Enforce that students cannot change their own account_status
DROP POLICY IF EXISTS "Users update their own profile" ON public.profiles;
CREATE POLICY "Users update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    ((id = (SELECT auth.uid())) OR (auth_user_id = (SELECT auth.uid())))
    AND public.is_student_active(id)
  )
  WITH CHECK (
    ((id = (SELECT auth.uid())) OR (auth_user_id = (SELECT auth.uid())))
    AND public.is_student_active(id)
    AND account_status = 'active'
  );

-- 6. RPC functions for Admin User Management
CREATE OR REPLACE FUNCTION public.get_admin_profiles_with_email(
  p_search text DEFAULT NULL,
  p_account_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  account_status text,
  deactivation_reason text,
  deactivation_details text,
  deactivated_at timestamptz,
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
    p.full_name,
    u.email::text,
    p.account_status,
    p.deactivation_reason,
    p.deactivation_details,
    p.deactivated_at,
    p.created_at,
    p.last_online
  FROM public.profiles p
  LEFT JOIN auth.users u ON p.id = u.id
  WHERE (
    p_search IS NULL
    OR p_search = ''
    OR p.full_name ILIKE '%' || p_search || '%'
    OR u.email ILIKE '%' || p_search || '%'
  )
  AND (
    p_account_status IS NULL
    OR p_account_status = 'all'
    OR p.account_status = p_account_status
  )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_profiles_count(
  p_search text DEFAULT NULL,
  p_account_status text DEFAULT NULL
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
  LEFT JOIN auth.users u ON p.id = u.id
  WHERE (
    p_search IS NULL
    OR p_search = ''
    OR p.full_name ILIKE '%' || p_search || '%'
    OR u.email ILIKE '%' || p_search || '%'
  )
  AND (
    p_account_status IS NULL
    OR p_account_status = 'all'
    OR p.account_status = p_account_status
  );

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_account_status_counts()
RETURNS TABLE (
  total_count bigint,
  active_count bigint,
  deactivated_count bigint
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
    count(*)::bigint AS total_count,
    count(*) FILTER (WHERE p.account_status = 'active')::bigint AS active_count,
    count(*) FILTER (WHERE p.account_status = 'deactivated')::bigint AS deactivated_count
  FROM public.profiles p;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_reactivation_requests(
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  student_name text,
  registered_email text,
  reactivation_reason text,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewer_name text,
  admin_remarks text,
  email_verified_at timestamptz
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
    r.id,
    r.user_id,
    COALESCE(p.full_name, 'Unknown Student') AS student_name,
    COALESCE(r.registered_email, u.email::text, '') AS registered_email,
    r.reactivation_reason,
    r.status,
    r.submitted_at,
    r.reviewed_at,
    r.reviewed_by,
    COALESCE(adm.full_name, 'Administrator') AS reviewer_name,
    r.admin_remarks,
    r.email_verified_at
  FROM public.account_reactivation_requests r
  LEFT JOIN public.profiles p ON r.user_id = p.id
  LEFT JOIN auth.users u ON r.user_id = u.id
  LEFT JOIN public.admins adm ON r.reviewed_by = adm.id
  WHERE (
    p_status IS NULL
    OR p_status = 'all'
    OR r.status = p_status
  )
  ORDER BY
    CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
    r.submitted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_profiles_with_email(text, text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_profiles_with_email(text, text, int, int) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_profiles_count(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_profiles_count(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_account_status_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_account_status_counts() TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_reactivation_requests(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_reactivation_requests(text) TO authenticated;
