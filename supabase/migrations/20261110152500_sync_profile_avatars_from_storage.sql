-- Migration: Sync student avatar URLs from Supabase Storage bucket `avatars` into `profiles` and RPCs
-- Date: 2026-11-10

-- 1. Helper to build a cache-busted public avatar URL from storage.objects
CREATE OR REPLACE FUNCTION public.build_storage_avatar_url(p_object_name text, p_updated_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_object_name IS NULL OR btrim(p_object_name) = '' THEN NULL
    ELSE
      'https://gfwlgojgpotnpmhtdrtz.supabase.co/storage/v1/object/public/avatars/'
      || p_object_name
      || CASE
           WHEN p_updated_at IS NOT NULL
             THEN '?v=' || floor(extract(epoch FROM p_updated_at))::bigint::text
           ELSE ''
         END
  END;
$$;

-- 2. Backfill profiles.avatar_url from existing objects in public bucket `avatars`
UPDATE public.profiles AS p
SET avatar_url = latest_obj.url
FROM (
  SELECT DISTINCT ON (target_profile.id)
    target_profile.id AS profile_id,
    public.build_storage_avatar_url(o.name, o.updated_at) AS url
  FROM public.profiles AS target_profile
  JOIN storage.objects AS o
    ON o.bucket_id = 'avatars'
   AND (
     split_part(o.name, '/', 1) = target_profile.id::text
     OR (target_profile.auth_user_id IS NOT NULL AND split_part(o.name, '/', 1) = target_profile.auth_user_id::text)
     OR o.owner = COALESCE(target_profile.auth_user_id, target_profile.id)
   )
  ORDER BY target_profile.id, o.updated_at DESC NULLS LAST, o.created_at DESC NULLS LAST
) AS latest_obj
WHERE p.id = latest_obj.profile_id
  AND latest_obj.url IS NOT NULL
  AND p.avatar_url IS DISTINCT FROM latest_obj.url;

-- 3. Trigger function to keep profiles.avatar_url synced on Storage uploads/deletes (best-effort if permitted)
CREATE OR REPLACE FUNCTION public.sync_profile_avatar_from_storage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bucket text;
  v_name text;
  v_folder text;
  v_owner uuid;
  v_url text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_bucket := OLD.bucket_id;
    v_name := OLD.name;
    v_owner := OLD.owner;
    v_url := NULL;
  ELSE
    v_bucket := NEW.bucket_id;
    v_name := NEW.name;
    v_owner := NEW.owner;
    v_url := public.build_storage_avatar_url(NEW.name, COALESCE(NEW.updated_at, now()));
  END IF;

  IF v_bucket <> 'avatars' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_folder := split_part(COALESCE(v_name, ''), '/', 1);

  UPDATE public.profiles AS p
  SET avatar_url = v_url
  WHERE p.id::text = v_folder
     OR (p.auth_user_id IS NOT NULL AND p.auth_user_id::text = v_folder)
     OR (v_owner IS NOT NULL AND COALESCE(p.auth_user_id, p.id) = v_owner);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS on_avatars_storage_sync ON storage.objects';
  EXECUTE 'CREATE TRIGGER on_avatars_storage_sync AFTER INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.sync_profile_avatar_from_storage()';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping storage.objects trigger creation due to managed storage table ownership; RPC lateral lookup remains active.';
END;
$$;

-- 4. Update get_admin_profiles_with_email to include live resolved avatar_url
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
    latest_session.latest_eri,
    latest_session.latest_eri_date,
    COALESCE(session_stats.completed_count, 0)::integer AS completed_assessments_count
  FROM public.profiles p
  LEFT JOIN auth.users u ON (p.id = u.id OR p.auth_user_id = u.id)
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

-- 5. Update get_emailable_students to also resolve storage avatars dynamically
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
    COALESCE(
      public.build_storage_avatar_url(avatar_obj.name, avatar_obj.updated_at),
      NULLIF(btrim(p.avatar_url), '')
    ) AS avatar_url,
    EXISTS (
      SELECT 1
      FROM public.staff_student_assignments AS a
      WHERE a.staff_id = v_caller_id
        AND a.student_user_id IN (p.id, COALESCE(p.auth_user_id, p.id))
    ) AS is_assigned
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u
    ON u.id = COALESCE(p.auth_user_id, p.id)
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

-- 6. Staff assigned students RPC including live avatar_url resolution from Storage
CREATE OR REPLACE FUNCTION public.get_staff_assigned_students()
RETURNS TABLE (
  id uuid,
  auth_user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz,
  last_online timestamptz
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
    p.last_online
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u
    ON u.id = COALESCE(p.auth_user_id, p.id)
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
  WHERE EXISTS (
    SELECT 1
    FROM public.staff_student_assignments AS a
    WHERE a.staff_id = v_caller_id
      AND a.student_user_id IN (p.id, COALESCE(p.auth_user_id, p.id))
  )
  ORDER BY p.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_assigned_students() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_assigned_students() TO authenticated;

NOTIFY pgrst, 'reload schema';
