-- Migration: Student Email Communication System (Logs, Role-Scoped Access, and Unassigned Email Permission)
-- Date: 2026-11-10

-- 1. Optional explicit permission for staff supervisors to email unassigned students
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS can_email_unassigned_students boolean NOT NULL DEFAULT false;

-- 2. Authoritative Email Communication Log Table
CREATE TABLE IF NOT EXISTS public.student_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_email text,
  sender_role text NOT NULL CHECK (sender_role IN ('admin', 'staff')),
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_user_id uuid,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  body_html text NOT NULL,
  template_key text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'delivered', 'failed', 'bounced')),
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  error_message text,
  provider_response jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_email_logs_created_at_idx
  ON public.student_email_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS student_email_logs_sender_id_idx
  ON public.student_email_logs (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS student_email_logs_recipient_profile_id_idx
  ON public.student_email_logs (recipient_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS student_email_logs_status_idx
  ON public.student_email_logs (status);

CREATE INDEX IF NOT EXISTS student_email_logs_provider_message_id_idx
  ON public.student_email_logs (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.student_email_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.student_email_logs FROM public, anon, authenticated;
GRANT SELECT ON public.student_email_logs TO authenticated;
GRANT ALL ON public.student_email_logs TO service_role;

DROP POLICY IF EXISTS "Admins view all student email logs" ON public.student_email_logs;
CREATE POLICY "Admins view all student email logs"
  ON public.student_email_logs
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Staff view own student email logs" ON public.student_email_logs;
CREATE POLICY "Staff view own student email logs"
  ON public.student_email_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_current_user_staff()
    AND sender_id = (SELECT auth.uid())
  );

-- 3. Trusted RPC returning eligible recipient students with authoritative registered emails
CREATE OR REPLACE FUNCTION public.get_emailable_students()
RETURNS TABLE (
  id uuid,
  auth_user_id uuid,
  full_name text,
  email text,
  account_status text,
  avatar_url text,
  is_assigned boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_admin boolean := public.is_current_user_admin();
  v_is_staff boolean := public.is_current_user_staff();
  v_can_email_unassigned boolean := false;
BEGIN
  IF v_caller_id IS NULL OR (NOT v_is_admin AND NOT v_is_staff) THEN
    RAISE EXCEPTION 'Access denied. Authorized administrator or staff session required.';
  END IF;

  IF NOT v_is_admin AND v_is_staff THEN
    SELECT COALESCE(s.can_email_unassigned_students, false)
    INTO v_can_email_unassigned
    FROM public.staff AS s
    WHERE s.id = v_caller_id
      AND COALESCE(s.is_active, true);
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.auth_user_id,
    p.full_name,
    COALESCE(u.email::text, p.email) AS email,
    COALESCE(p.account_status, 'active') AS account_status,
    p.avatar_url,
    EXISTS (
      SELECT 1
      FROM public.staff_student_assignments AS a
      WHERE a.staff_id = v_caller_id
        AND a.student_user_id IN (p.id, COALESCE(p.auth_user_id, p.id))
    ) AS is_assigned
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u
    ON u.id = COALESCE(p.auth_user_id, p.id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admins AS adm WHERE adm.id IN (p.id, COALESCE(p.auth_user_id, p.id))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.staff AS stf WHERE stf.id IN (p.id, COALESCE(p.auth_user_id, p.id))
  )
  AND (
    v_is_admin
    OR v_can_email_unassigned
    OR EXISTS (
      SELECT 1
      FROM public.staff_student_assignments AS a
      WHERE a.staff_id = v_caller_id
        AND a.student_user_id IN (p.id, COALESCE(p.auth_user_id, p.id))
    )
  )
  ORDER BY p.full_name ASC, p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_emailable_students() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_emailable_students() TO authenticated;

NOTIFY pgrst, 'reload schema';
