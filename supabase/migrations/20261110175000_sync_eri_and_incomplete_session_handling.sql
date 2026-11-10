-- Migration: Synchronize ERI calculation with Android formula & enforce strict incomplete session exclusion
-- Date: 2026-11-10

-- 1. Canonical interview session status classifier matching Android completion & partial-session rules
CREATE OR REPLACE FUNCTION public.classify_interview_session_status(
  p_question_count integer,
  p_completed_count integer,
  p_summary text,
  p_created_at timestamptz,
  p_status text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN UPPER(BTRIM(COALESCE(p_status, ''))) IN (
      'INCOMPLETE',
      'ENDED_EARLY',
      'ENDED EARLY',
      'ABANDONED',
      'DISCARDED',
      'CANCELLED',
      'FAILED'
    ) THEN 'INCOMPLETE'
    WHEN UPPER(BTRIM(COALESCE(p_status, ''))) IN ('IN_PROGRESS', 'IN PROGRESS') THEN
      CASE
        WHEN COALESCE(p_question_count, 0) > 0
          AND COALESCE(p_completed_count, 0) >= p_question_count
          AND COALESCE(p_summary, '') NOT ILIKE '[Ended Early]%'
          AND COALESCE(p_summary, '') NOT ILIKE 'Interview in progress%'
          THEN 'COMPLETED'
        ELSE 'IN PROGRESS'
      END
    WHEN COALESCE(p_question_count, 0) > 0
      AND COALESCE(p_completed_count, 0) >= p_question_count
      AND BTRIM(COALESCE(p_summary, '')) NOT ILIKE '[Ended Early]%'
      AND BTRIM(COALESCE(p_summary, '')) NOT ILIKE 'Interview in progress%'
      THEN 'COMPLETED'
    WHEN BTRIM(COALESCE(p_summary, '')) ILIKE 'Interview in progress%'
      AND p_created_at IS NOT NULL
      AND p_created_at >= (now() - interval '2 hours')
      THEN 'IN PROGRESS'
    ELSE 'INCOMPLETE'
  END;
$$;

REVOKE ALL ON FUNCTION public.classify_interview_session_status(integer, integer, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classify_interview_session_status(integer, integer, text, timestamptz, text) TO authenticated;

-- 2. Canonical question category normalizer (HR, Behavioral, Situational, Technical)
CREATE OR REPLACE FUNCTION public.normalize_eri_category(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE LOWER(BTRIM(COALESCE(p_category, '')))
    WHEN 'hr' THEN 'HR'
    WHEN 'behavioral' THEN 'Behavioral'
    WHEN 'situational' THEN 'Situational'
    WHEN 'technical' THEN 'Technical'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_eri_category(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_eri_category(text) TO authenticated;

-- 3. Internal centralized per-student ERI computation (Single Source of Truth)
--    Steps match Android implementation:
--    a) Select ONLY COMPLETED sessions for the student (never INCOMPLETE / IN PROGRESS / discarded)
--    b) Deduplicate valid evaluated question scores (ai_score IS NOT NULL) per (session_id, question_id)
--    c) Compute mean score per available category (HR, Behavioral, Situational, Technical)
--    d) ERI = Sum(Available Category Averages) / Number(Available Categories), rounded to 2 decimal places
--       Returns NULL when 0 categories have eligible completed scores.
CREATE OR REPLACE FUNCTION public._compute_student_eri_summary(
  p_profile_id uuid,
  p_auth_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  latest_eri numeric,
  latest_eri_date timestamptz,
  hr_average numeric,
  behavioral_average numeric,
  situational_average numeric,
  technical_average numeric,
  available_categories_count integer,
  completed_assessments_count integer,
  total_completed_sessions integer,
  incomplete_assessments_count integer,
  in_progress_assessments_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH user_sessions AS (
    SELECT DISTINCT ON (s.id)
      s.id,
      s.created_at,
      public.classify_interview_session_status(
        s.question_count,
        s.completed_count,
        s.summary,
        s.created_at,
        to_jsonb(s)->>'status'
      ) AS session_status
    FROM public.interview_sessions AS s
    WHERE s.profile_id = p_profile_id
       OR (p_auth_user_id IS NOT NULL AND s.profile_id = p_auth_user_id)
    ORDER BY s.id, s.created_at DESC
  ),
  session_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE session_status = 'COMPLETED')::integer AS total_completed_sessions,
      COUNT(*) FILTER (WHERE session_status = 'INCOMPLETE')::integer AS incomplete_assessments_count,
      COUNT(*) FILTER (WHERE session_status = 'IN PROGRESS')::integer AS in_progress_assessments_count
    FROM user_sessions
  ),
  completed_results AS (
    SELECT DISTINCT ON (ir.session_id, ir.question_id)
      ir.session_id,
      us.created_at AS session_created_at,
      public.normalize_eri_category(q.category) AS category_name,
      ir.ai_score::numeric AS score
    FROM public.interview_results AS ir
    JOIN user_sessions AS us ON us.id = ir.session_id
    JOIN public.questions AS q ON q.id = ir.question_id
    WHERE us.session_status = 'COMPLETED'
      AND ir.question_id IS NOT NULL
      AND ir.ai_score IS NOT NULL
      AND ir.ai_score BETWEEN 0 AND 100
      AND public.normalize_eri_category(q.category) IS NOT NULL
    ORDER BY ir.session_id, ir.question_id, ir.created_at DESC, ir.id DESC
  ),
  evaluated_session_stats AS (
    SELECT
      COUNT(DISTINCT session_id)::integer AS valid_evaluated_sessions_count,
      MAX(session_created_at) AS latest_evaluated_date
    FROM completed_results
  ),
  category_averages AS (
    SELECT
      category_name,
      AVG(score) AS raw_avg
    FROM completed_results
    GROUP BY category_name
  ),
  aggregated_eri AS (
    SELECT
      CASE
        WHEN COUNT(*) > 0 THEN ROUND(SUM(raw_avg) / COUNT(*), 2)
        ELSE NULL
      END AS eri_score,
      ROUND(MAX(raw_avg) FILTER (WHERE category_name = 'HR'), 2) AS hr_avg,
      ROUND(MAX(raw_avg) FILTER (WHERE category_name = 'Behavioral'), 2) AS behavioral_avg,
      ROUND(MAX(raw_avg) FILTER (WHERE category_name = 'Situational'), 2) AS situational_avg,
      ROUND(MAX(raw_avg) FILTER (WHERE category_name = 'Technical'), 2) AS technical_avg,
      COUNT(*)::integer AS category_count
    FROM category_averages
  )
  SELECT
    agg.eri_score AS latest_eri,
    eval_stats.latest_evaluated_date AS latest_eri_date,
    agg.hr_avg AS hr_average,
    agg.behavioral_avg AS behavioral_average,
    agg.situational_avg AS situational_average,
    agg.technical_avg AS technical_average,
    COALESCE(agg.category_count, 0)::integer AS available_categories_count,
    COALESCE(eval_stats.valid_evaluated_sessions_count, 0)::integer AS completed_assessments_count,
    COALESCE(sc.total_completed_sessions, 0)::integer AS total_completed_sessions,
    COALESCE(sc.incomplete_assessments_count, 0)::integer AS incomplete_assessments_count,
    COALESCE(sc.in_progress_assessments_count, 0)::integer AS in_progress_assessments_count
  FROM session_counts AS sc
  CROSS JOIN evaluated_session_stats AS eval_stats
  CROSS JOIN aggregated_eri AS agg;
$$;

REVOKE ALL ON FUNCTION public._compute_student_eri_summary(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._compute_student_eri_summary(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._compute_student_eri_summary(uuid, uuid) FROM authenticated;

-- 4. Update get_admin_profiles_with_email to return accurate category-averaged ERI (numeric 2 decimals),
--    4-category averages, and separated completed vs incomplete session counts while preserving storage avatars.
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_email(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_email(text, text, int, int);

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
  avatar_url text,
  account_status text,
  deactivation_reason text,
  deactivation_details text,
  deactivated_at timestamptz,
  deactivated_by uuid,
  created_at timestamptz,
  last_online timestamptz,
  latest_eri numeric,
  latest_eri_date timestamptz,
  completed_assessments_count integer,
  incomplete_assessments_count integer,
  in_progress_assessments_count integer,
  hr_average numeric,
  behavioral_average numeric,
  situational_average numeric,
  technical_average numeric,
  available_categories_count integer
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
    COALESCE(u.email::text, p.email) AS email,
    COALESCE(
      public.build_storage_avatar_url(avatar_obj.name, avatar_obj.updated_at),
      NULLIF(btrim(p.avatar_url), '')
    ) AS avatar_url,
    COALESCE(p.account_status, 'active') AS account_status,
    p.deactivation_reason,
    p.deactivation_details,
    p.deactivated_at,
    p.deactivated_by,
    p.created_at,
    p.last_online,
    eri.latest_eri,
    eri.latest_eri_date,
    eri.completed_assessments_count,
    eri.incomplete_assessments_count,
    eri.in_progress_assessments_count,
    eri.hr_average,
    eri.behavioral_average,
    eri.situational_average,
    eri.technical_average,
    eri.available_categories_count
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u ON (p.id = u.id OR p.auth_user_id = u.id)
  LEFT JOIN LATERAL (
    SELECT o.name, o.updated_at
    FROM storage.objects AS o
    WHERE o.bucket_id = 'avatars'
      AND (
        split_part(o.name, '/', 1) = p.id::text
        OR (p.auth_user_id IS NOT NULL AND split_part(o.name, '/', 1) = p.auth_user_id::text)
        OR o.owner = COALESCE(p.auth_user_id, p.id)
      )
    ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC NULLS LAST
    LIMIT 1
  ) AS avatar_obj ON true
  LEFT JOIN LATERAL public._compute_student_eri_summary(p.id, p.auth_user_id) AS eri ON true
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

REVOKE ALL ON FUNCTION public.get_admin_profiles_with_email(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_profiles_with_email(text, text, int, int) TO authenticated;

-- 5. Provide Staff with assigned-student ERI & category breakdown using exact same single source of truth
DROP FUNCTION IF EXISTS public.get_staff_assigned_students_with_eri();

CREATE OR REPLACE FUNCTION public.get_staff_assigned_students_with_eri()
RETURNS TABLE (
  id uuid,
  auth_user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz,
  last_online timestamptz,
  latest_eri numeric,
  latest_eri_date timestamptz,
  completed_assessments_count integer,
  incomplete_assessments_count integer,
  in_progress_assessments_count integer,
  hr_average numeric,
  behavioral_average numeric,
  situational_average numeric,
  technical_average numeric,
  available_categories_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_current_user_staff() THEN
    RAISE EXCEPTION 'Access denied. Active staff account required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.auth_user_id,
    p.full_name,
    COALESCE(u.email::text, p.email) AS email,
    COALESCE(
      public.build_storage_avatar_url(avatar_obj.name, avatar_obj.updated_at),
      NULLIF(btrim(p.avatar_url), '')
    ) AS avatar_url,
    p.created_at,
    p.last_online,
    eri.latest_eri,
    eri.latest_eri_date,
    eri.completed_assessments_count,
    eri.incomplete_assessments_count,
    eri.in_progress_assessments_count,
    eri.hr_average,
    eri.behavioral_average,
    eri.situational_average,
    eri.technical_average,
    eri.available_categories_count
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u ON (p.id = u.id OR p.auth_user_id = u.id)
  LEFT JOIN LATERAL (
    SELECT o.name, o.updated_at
    FROM storage.objects AS o
    WHERE o.bucket_id = 'avatars'
      AND (
        split_part(o.name, '/', 1) = p.id::text
        OR (p.auth_user_id IS NOT NULL AND split_part(o.name, '/', 1) = p.auth_user_id::text)
        OR o.owner = COALESCE(p.auth_user_id, p.id)
      )
    ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC NULLS LAST
    LIMIT 1
  ) AS avatar_obj ON true
  LEFT JOIN LATERAL public._compute_student_eri_summary(p.id, p.auth_user_id) AS eri ON true
  WHERE EXISTS (
    SELECT 1
    FROM public.staff_student_assignments AS a
    WHERE a.staff_id = v_caller_id
      AND (
        a.student_user_id = p.id
        OR (p.auth_user_id IS NOT NULL AND a.student_user_id = p.auth_user_id)
      )
  )
  ORDER BY p.full_name ASC NULLS LAST, p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_assigned_students_with_eri() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_assigned_students_with_eri() TO authenticated;

-- 6. Student detail ERI & completed-session history RPC for both Admin and assigned Staff
DROP FUNCTION IF EXISTS public.get_student_eri_analytics_for_user(uuid);

CREATE OR REPLACE FUNCTION public.get_student_eri_analytics_for_user(
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile record;
  v_summary record;
  v_history jsonb;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Student identifier is required.';
  END IF;

  SELECT p.id, p.auth_user_id
  INTO v_profile
  FROM public.profiles AS p
  WHERE p.id = p_student_id
     OR (p.auth_user_id IS NOT NULL AND p.auth_user_id = p_student_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found.';
  END IF;

  IF NOT (
    public.is_current_user_admin()
    OR public.staff_can_view_student(v_profile.id)
    OR (v_profile.auth_user_id IS NOT NULL AND public.staff_can_view_student(v_profile.auth_user_id))
  ) THEN
    RAISE EXCEPTION 'Access denied. You are not authorized to view this student''s ERI analytics.';
  END IF;

  SELECT *
  INTO v_summary
  FROM public._compute_student_eri_summary(v_profile.id, v_profile.auth_user_id);

  WITH eligible_sessions AS (
    SELECT DISTINCT ON (s.id)
      s.id,
      s.created_at,
      s.question_count,
      s.completed_count,
      s.speech_score,
      s.camera_score,
      s.summary
    FROM public.interview_sessions AS s
    WHERE (
      s.profile_id = v_profile.id
      OR (v_profile.auth_user_id IS NOT NULL AND s.profile_id = v_profile.auth_user_id)
    )
    AND public.classify_interview_session_status(
      s.question_count,
      s.completed_count,
      s.summary,
      s.created_at,
      to_jsonb(s)->>'status'
    ) = 'COMPLETED'
    ORDER BY s.id, s.created_at ASC
  ),
  session_results AS (
    SELECT DISTINCT ON (ir.session_id, ir.question_id)
      ir.session_id,
      public.normalize_eri_category(q.category) AS category_name,
      ir.ai_score::numeric AS score
    FROM public.interview_results AS ir
    JOIN eligible_sessions AS es ON es.id = ir.session_id
    JOIN public.questions AS q ON q.id = ir.question_id
    WHERE ir.question_id IS NOT NULL
      AND ir.ai_score IS NOT NULL
      AND ir.ai_score BETWEEN 0 AND 100
      AND public.normalize_eri_category(q.category) IS NOT NULL
    ORDER BY ir.session_id, ir.question_id, ir.created_at DESC, ir.id DESC
  ),
  session_category_avgs AS (
    SELECT
      session_id,
      category_name,
      AVG(score) AS cat_avg
    FROM session_results
    GROUP BY session_id, category_name
  ),
  session_eri_rows AS (
    SELECT
      es.id,
      es.created_at,
      es.question_count,
      es.completed_count,
      es.speech_score,
      es.camera_score,
      es.summary,
      ROUND(AVG(sca.cat_avg), 2) AS computed_eri,
      ROUND(MAX(sca.cat_avg) FILTER (WHERE sca.category_name = 'HR'), 2) AS hr_avg,
      ROUND(MAX(sca.cat_avg) FILTER (WHERE sca.category_name = 'Behavioral'), 2) AS behavioral_avg,
      ROUND(MAX(sca.cat_avg) FILTER (WHERE sca.category_name = 'Situational'), 2) AS situational_avg,
      ROUND(MAX(sca.cat_avg) FILTER (WHERE sca.category_name = 'Technical'), 2) AS technical_avg,
      COUNT(sca.category_name)::integer AS categories_count
    FROM eligible_sessions AS es
    JOIN session_category_avgs AS sca ON sca.session_id = es.id
    GROUP BY es.id, es.created_at, es.question_count, es.completed_count, es.speech_score, es.camera_score, es.summary
    ORDER BY es.created_at ASC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'created_at', r.created_at,
    'question_count', r.question_count,
    'completed_count', r.completed_count,
    'speech_score', r.speech_score,
    'camera_score', r.camera_score,
    'summary', r.summary,
    'overall_score', r.computed_eri,
    'score', r.computed_eri,
    'hr_average', r.hr_avg,
    'behavioral_average', r.behavioral_avg,
    'situational_average', r.situational_avg,
    'technical_average', r.technical_avg,
    'categories_count', r.categories_count
  ) ORDER BY r.created_at ASC), '[]'::jsonb)
  INTO v_history
  FROM session_eri_rows AS r;

  RETURN jsonb_build_object(
    'latest_eri', v_summary.latest_eri,
    'latest_eri_date', v_summary.latest_eri_date,
    'hr_average', v_summary.hr_average,
    'behavioral_average', v_summary.behavioral_average,
    'situational_average', v_summary.situational_average,
    'technical_average', v_summary.technical_average,
    'available_categories_count', v_summary.available_categories_count,
    'completed_assessments_count', v_summary.completed_assessments_count,
    'total_completed_sessions', v_summary.total_completed_sessions,
    'incomplete_assessments_count', v_summary.incomplete_assessments_count,
    'in_progress_assessments_count', v_summary.in_progress_assessments_count,
    'completed_sessions', v_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_eri_analytics_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_eri_analytics_for_user(uuid) TO authenticated;

-- 7. Update system-wide Admin ERI Analytics RPC to compute from COMPLETED sessions & category averages only
DROP FUNCTION IF EXISTS public.get_admin_eri_analytics();

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
  completed_sessions_total bigint,
  incomplete_sessions_total bigint,
  in_progress_sessions_total bigint,
  valid_evaluated_sessions_total bigint,
  hr_average numeric,
  behavioral_average numeric,
  situational_average numeric,
  technical_average numeric,
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
  v_completed_sessions_total bigint := 0;
  v_incomplete_sessions_total bigint := 0;
  v_in_progress_sessions_total bigint := 0;
  v_valid_evaluated_sessions_total bigint := 0;
  v_hr_avg numeric;
  v_behavioral_avg numeric;
  v_situational_avg numeric;
  v_technical_avg numeric;
  v_recent_json jsonb;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  SELECT count(*) INTO v_total_students FROM public.profiles;

  WITH per_student_eri AS (
    SELECT
      p.id,
      eri.*
    FROM public.profiles AS p
    CROSS JOIN LATERAL public._compute_student_eri_summary(p.id, p.auth_user_id) AS eri
  )
  SELECT
    COUNT(*) FILTER (WHERE latest_eri IS NOT NULL),
    ROUND(AVG(latest_eri) FILTER (WHERE latest_eri IS NOT NULL), 2),
    COUNT(*) FILTER (WHERE latest_eri IS NOT NULL AND latest_eri >= 85),
    COUNT(*) FILTER (WHERE latest_eri IS NOT NULL AND latest_eri >= 70 AND latest_eri < 85),
    COUNT(*) FILTER (WHERE latest_eri IS NOT NULL AND latest_eri >= 50 AND latest_eri < 70),
    COUNT(*) FILTER (WHERE latest_eri IS NOT NULL AND latest_eri < 50),
    COALESCE(SUM(total_completed_sessions), 0),
    COALESCE(SUM(incomplete_assessments_count), 0),
    COALESCE(SUM(in_progress_assessments_count), 0),
    COALESCE(SUM(completed_assessments_count), 0),
    ROUND(AVG(hr_average) FILTER (WHERE hr_average IS NOT NULL), 2),
    ROUND(AVG(behavioral_average) FILTER (WHERE behavioral_average IS NOT NULL), 2),
    ROUND(AVG(situational_average) FILTER (WHERE situational_average IS NOT NULL), 2),
    ROUND(AVG(technical_average) FILTER (WHERE technical_average IS NOT NULL), 2)
  INTO
    v_students_with_eri,
    v_average_eri,
    v_highly_ready,
    v_ready,
    v_developing,
    v_needs_practice,
    v_completed_sessions_total,
    v_incomplete_sessions_total,
    v_in_progress_sessions_total,
    v_valid_evaluated_sessions_total,
    v_hr_avg,
    v_behavioral_avg,
    v_situational_avg,
    v_technical_avg
  FROM per_student_eri;

  v_students_with_eri := COALESCE(v_students_with_eri, 0);
  v_students_without_eri := GREATEST(0, v_total_students - v_students_with_eri);

  -- Recent 5 strictly COMPLETED + evaluated assessments with accurate computed session ERI
  WITH recent_completed AS (
    SELECT DISTINCT ON (s.id)
      s.id,
      s.profile_id,
      p.full_name AS student_name,
      p.email AS student_email,
      s.speech_score,
      s.camera_score,
      s.completed_count,
      s.question_count,
      s.created_at
    FROM public.interview_sessions AS s
    JOIN public.profiles AS p
      ON (s.profile_id = p.id OR (p.auth_user_id IS NOT NULL AND s.profile_id = p.auth_user_id))
    WHERE public.classify_interview_session_status(
      s.question_count,
      s.completed_count,
      s.summary,
      s.created_at,
      to_jsonb(s)->>'status'
    ) = 'COMPLETED'
      AND EXISTS (
        SELECT 1
        FROM public.interview_results AS ir
        WHERE ir.session_id = s.id
          AND ir.ai_score IS NOT NULL
      )
    ORDER BY s.id, s.created_at DESC
  ),
  recent_with_scores AS (
    SELECT
      rc.*,
      (
        SELECT ROUND(AVG(cat_avg), 2)
        FROM (
          SELECT AVG(dedup.ai_score::numeric) AS cat_avg
          FROM (
            SELECT DISTINCT ON (ir.question_id)
              ir.question_id,
              public.normalize_eri_category(q.category) AS category_name,
              ir.ai_score
            FROM public.interview_results AS ir
            JOIN public.questions AS q ON q.id = ir.question_id
            WHERE ir.session_id = rc.id
              AND ir.ai_score IS NOT NULL
              AND public.normalize_eri_category(q.category) IS NOT NULL
            ORDER BY ir.question_id, ir.created_at DESC, ir.id DESC
          ) AS dedup
          GROUP BY dedup.category_name
        ) AS cat_avgs
      ) AS eri_score
    FROM recent_completed AS rc
    ORDER BY rc.created_at DESC
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  INTO v_recent_json
  FROM recent_with_scores AS r;

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
    v_completed_sessions_total,
    v_incomplete_sessions_total,
    v_in_progress_sessions_total,
    v_valid_evaluated_sessions_total,
    v_hr_avg,
    v_behavioral_avg,
    v_situational_avg,
    v_technical_avg,
    v_recent_json;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_eri_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_eri_analytics() TO authenticated;

-- 8. Ensure authorized Staff can read linked questions (even if later archived) for category resolution
DROP POLICY IF EXISTS "Staff read interview questions" ON public.questions;
CREATE POLICY "Staff read interview questions"
  ON public.questions
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_staff());

NOTIFY pgrst, 'reload schema';
