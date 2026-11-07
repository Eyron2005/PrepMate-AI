-- Migration: Student Employment Readiness Index (ERI) Analytics and Profile Integration
-- Date: 2026-11-08

-- 1. Drop existing function signature to allow adding ERI columns to the return table
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_email(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_email(text, text, int, int);

-- 2. Enhanced get_admin_profiles_with_email with latest ERI and completed assessment counts
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
  last_online timestamptz,
  latest_eri integer,
  latest_eri_date timestamptz,
  completed_assessments_count integer
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
    p.last_online,
    latest_session.latest_eri,
    latest_session.latest_eri_date,
    COALESCE(session_stats.completed_count, 0)::integer AS completed_assessments_count
  FROM public.profiles p
  LEFT JOIN auth.users u ON (p.id = u.id OR p.auth_user_id = u.id)
  LEFT JOIN LATERAL (
    SELECT
      s.overall_score AS latest_eri,
      s.created_at AS latest_eri_date
    FROM public.interview_sessions s
    WHERE s.profile_id = p.id
      AND s.completed_count > 0
    ORDER BY s.created_at DESC
    LIMIT 1
  ) latest_session ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS completed_count
    FROM public.interview_sessions s
    WHERE s.profile_id = p.id
      AND s.completed_count > 0
  ) session_stats ON true
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

-- 3. Dedicated Admin ERI Overview Analytics RPC
CREATE OR REPLACE FUNCTION public.get_admin_eri_analytics()
RETURNS TABLE (
  total_students bigint,
  students_with_eri bigint,
  students_without_eri bigint,
  average_eri numeric,
  count_highly_ready bigint,
  count_ready bigint,
  count_developing bigint,
  count_needs_practice bigint,
  recent_assessments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_students bigint;
  v_students_with_eri bigint;
  v_students_without_eri bigint;
  v_average_eri numeric;
  v_highly_ready bigint := 0;
  v_ready bigint := 0;
  v_developing bigint := 0;
  v_needs_practice bigint := 0;
  v_recent_json jsonb;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  -- Total registered students
  SELECT count(*) INTO v_total_students FROM public.profiles;

  -- Temporary table of student latest ERI scores
  WITH student_latest_eri AS (
    SELECT DISTINCT ON (s.profile_id)
      s.profile_id,
      s.overall_score AS score,
      s.created_at
    FROM public.interview_sessions s
    JOIN public.profiles p ON s.profile_id = p.id
    WHERE s.completed_count > 0
    ORDER BY s.profile_id, s.created_at DESC
  )
  SELECT
    count(*),
    ROUND(AVG(score), 1),
    COUNT(*) FILTER (WHERE score >= 85),
    COUNT(*) FILTER (WHERE score >= 70 AND score < 85),
    COUNT(*) FILTER (WHERE score >= 50 AND score < 70),
    COUNT(*) FILTER (WHERE score < 50)
  INTO
    v_students_with_eri,
    v_average_eri,
    v_highly_ready,
    v_ready,
    v_developing,
    v_needs_practice
  FROM student_latest_eri;

  v_students_with_eri := COALESCE(v_students_with_eri, 0);
  v_students_without_eri := GREATEST(0, v_total_students - v_students_with_eri);
  v_average_eri := COALESCE(v_average_eri, 0);

  -- Recent 5 completed assessments with candidate names
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb)
  INTO v_recent_json
  FROM (
    SELECT
      s.id,
      s.profile_id,
      p.full_name AS student_name,
      p.email AS student_email,
      s.overall_score AS eri_score,
      s.speech_score,
      s.camera_score,
      s.completed_count,
      s.question_count,
      s.created_at
    FROM public.interview_sessions s
    JOIN public.profiles p ON s.profile_id = p.id
    WHERE s.completed_count > 0
    ORDER BY s.created_at DESC
    LIMIT 5
  ) sub;

  RETURN QUERY
  SELECT
    v_total_students,
    v_students_with_eri,
    v_students_without_eri,
    v_average_eri,
    v_highly_ready,
    v_ready,
    v_developing,
    v_needs_practice,
    v_recent_json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_eri_analytics() TO authenticated;
