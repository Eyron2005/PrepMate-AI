import { supabase } from "./supabase.js";

export function normalizeConfigName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeComparableKey(value) {
  return normalizeConfigName(value).toLowerCase();
}

export function validateIndustryInput(input, existingIndustries = [], currentId = null) {
  const name = normalizeConfigName(input?.name);
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  const is_active = input?.is_active !== false;

  if (!name) {
    return { ok: false, error: "Please enter an industry name." };
  }
  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: "Industry name must be 2 to 100 characters long." };
  }

  const key = normalizeComparableKey(name);
  const duplicate = (existingIndustries || []).find(
    (item) => String(item.id) !== String(currentId || "") && normalizeComparableKey(item.name) === key
  );
  if (duplicate) {
    return { ok: false, error: `An industry named "${duplicate.name}" already exists.` };
  }

  return { ok: true, value: { name, description, is_active } };
}

export function validateJobRoleInput(input, existingRoles = [], currentId = null) {
  const industry_id = typeof input?.industry_id === "string" ? input.industry_id.trim() : "";
  const name = normalizeConfigName(input?.name);
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  const is_active = input?.is_active !== false;

  if (!industry_id) {
    return { ok: false, error: "Please choose an industry for this job role." };
  }
  if (!name) {
    return { ok: false, error: "Please enter a job role name." };
  }
  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: "Job role name must be 2 to 100 characters long." };
  }

  const key = normalizeComparableKey(name);
  const duplicate = (existingRoles || []).find(
    (item) =>
      String(item.id) !== String(currentId || "") &&
      String(item.industry_id) === industry_id &&
      normalizeComparableKey(item.name) === key
  );
  if (duplicate) {
    return {
      ok: false,
      error: `Job role "${duplicate.name}" already exists in the selected industry.`,
    };
  }

  return {
    ok: true,
    value: {
      industry_id,
      name,
      description,
      is_active,
    },
  };
}

export function canDeleteConfigRecord(usage = {}) {
  const questions = Number(usage.questions || 0);
  const sessions = Number(usage.sessions || 0);
  const childRoles = Number(usage.childRoles || 0);

  const blockers = [];
  if (questions > 0) blockers.push(`${questions} question(s)`);
  if (sessions > 0) blockers.push(`${sessions} past interview(s)`);
  if (childRoles > 0) blockers.push(`${childRoles} job role(s)`);

  if (blockers.length > 0) {
    return {
      allowed: false,
      reason: `Still used by ${blockers.join(", ")}. You can deactivate it instead of deleting.`,
    };
  }

  return { allowed: true, reason: "" };
}

function formatDbError(error, fallback) {
  if (!error) return fallback;
  if (error.code === "23505") {
    return "That name already exists. Please use a different name.";
  }
  if (error.code === "23503") {
    return "This item is still used by existing questions, job roles, or interviews. You can deactivate it instead.";
  }
  return error.message || fallback;
}

export async function fetchInterviewModeCatalog() {
  const [industriesRes, rolesRes, questionsRes, sessionsRes] = await Promise.all([
    supabase.from("interview_industries").select("*").order("name"),
    supabase.from("interview_job_roles").select("*").order("name"),
    supabase
      .from("questions")
      .select("id, industry_id, job_role_id"),
    supabase
      .from("interview_sessions")
      .select("id, industry_id, job_role_id"),
  ]);

  const firstError =
    industriesRes.error ||
    rolesRes.error ||
    questionsRes.error ||
    sessionsRes.error;

  if (firstError) {
    return {
      ok: false,
      error: formatDbError(firstError, "Could not load industries and job roles right now. Please try again."),
      data: null,
    };
  }

  const industries = industriesRes.data || [];
  const jobRoles = rolesRes.data || [];
  const questions = questionsRes.data || [];
  const sessions = sessionsRes.data || [];

  const usageByIndustryId = {};
  const usageByJobRoleId = {};

  for (const ind of industries) {
    usageByIndustryId[ind.id] = { childRoles: 0, questions: 0, sessions: 0 };
  }
  for (const jr of jobRoles) {
    usageByJobRoleId[jr.id] = { questions: 0, sessions: 0 };
    if (usageByIndustryId[jr.industry_id]) usageByIndustryId[jr.industry_id].childRoles += 1;
  }

  for (const q of questions) {
    if (q.industry_id && usageByIndustryId[q.industry_id]) usageByIndustryId[q.industry_id].questions += 1;
    if (q.job_role_id && usageByJobRoleId[q.job_role_id]) usageByJobRoleId[q.job_role_id].questions += 1;
  }

  for (const s of sessions) {
    if (s.industry_id && usageByIndustryId[s.industry_id]) usageByIndustryId[s.industry_id].sessions += 1;
    if (s.job_role_id && usageByJobRoleId[s.job_role_id]) usageByJobRoleId[s.job_role_id].sessions += 1;
  }

  return {
    ok: true,
    error: null,
    data: {
      industries,
      jobRoles,
      usageByIndustryId,
      usageByJobRoleId,
    },
  };
}

export async function saveIndustry({ id = null, ...input }, existingIndustries = []) {
  const check = validateIndustryInput(input, existingIndustries, id);
  if (!check.ok) return { ok: false, error: check.error, data: null };

  const query = id
    ? supabase.from("interview_industries").update(check.value).eq("id", id).select("*").single()
    : supabase.from("interview_industries").insert([check.value]).select("*").single();

  const { data, error } = await query;
  if (error) return { ok: false, error: formatDbError(error, "Unable to save industry."), data: null };
  return { ok: true, error: null, data };
}

export async function setIndustryActive(industryId, isActive) {
  const { data, error } = await supabase
    .from("interview_industries")
    .update({ is_active: Boolean(isActive) })
    .eq("id", industryId)
    .select("*")
    .single();
  if (error) return { ok: false, error: formatDbError(error, "Unable to update industry status."), data: null };
  return { ok: true, error: null, data };
}

export async function deleteIndustry(industryId) {
  const { error } = await supabase.from("interview_industries").delete().eq("id", industryId);
  if (error) return { ok: false, error: formatDbError(error, "Unable to delete industry.") };
  return { ok: true, error: null };
}

export async function saveJobRole({ id = null, ...input }, existingRoles = []) {
  const check = validateJobRoleInput(input, existingRoles, id);
  if (!check.ok) return { ok: false, error: check.error, data: null };

  const query = id
    ? supabase.from("interview_job_roles").update(check.value).eq("id", id).select("*").single()
    : supabase.from("interview_job_roles").insert([check.value]).select("*").single();

  const { data, error } = await query;
  if (error) return { ok: false, error: formatDbError(error, "Unable to save job role."), data: null };
  return { ok: true, error: null, data };
}

export async function setJobRoleActive(jobRoleId, isActive) {
  const { data, error } = await supabase
    .from("interview_job_roles")
    .update({ is_active: Boolean(isActive) })
    .eq("id", jobRoleId)
    .select("*")
    .single();
  if (error) return { ok: false, error: formatDbError(error, "Unable to update job role status."), data: null };
  return { ok: true, error: null, data };
}

export async function deleteJobRole(jobRoleId) {
  const { error } = await supabase.from("interview_job_roles").delete().eq("id", jobRoleId);
  if (error) return { ok: false, error: formatDbError(error, "Unable to delete job role.") };
  return { ok: true, error: null };
}
