import { supabase } from "./supabase.js";

/**
 * Retrieves the deduplicated student user IDs explicitly assigned to the signed-in staff user.
 */
export async function fetchAssignedStudentIds() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    throw userError || new Error("Unable to identify the signed-in staff user.");
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("staff_student_assignments")
    .select("student_user_id")
    .eq("staff_id", userData.user.id);

  if (assignmentError) throw assignmentError;

  return [
    ...new Set((assignmentRows || []).map((row) => row.student_user_id).filter(Boolean)),
  ];
}

/**
 * Checks whether a student profile record matches any of the assigned student user IDs.
 */
export function isAssignedStudentProfile(profile, assignedIds) {
  if (!profile || !Array.isArray(assignedIds) || assignedIds.length === 0) {
    return false;
  }
  const assignedSet = new Set(assignedIds);
  return (
    (Boolean(profile.id) && assignedSet.has(profile.id)) ||
    (Boolean(profile.auth_user_id) && assignedSet.has(profile.auth_user_id))
  );
}
