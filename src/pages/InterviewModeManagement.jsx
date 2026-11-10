import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaSlidersH,
  FaIndustry,
  FaBriefcase,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimes,
  FaSyncAlt,
  FaQuestionCircle,
  FaLock,
} from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import ConfirmConfigActionModal from "../components/interview-mode/ConfirmConfigActionModal";
import IndustryManagerSection from "../components/interview-mode/IndustryManagerSection";
import JobRoleManagerSection from "../components/interview-mode/JobRoleManagerSection";
import { fetchInterviewModeCatalog } from "../services/interviewMode";

const TABS = [
  { key: "industries", label: "Industries", icon: FaIndustry },
  { key: "job_roles", label: "Job Roles", icon: FaBriefcase },
];

export default function InterviewModeManagement() {
  const [activeTab, setActiveTab] = useState("industries");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [catalog, setCatalog] = useState({
    industries: [],
    jobRoles: [],
    usageByIndustryId: {},
    usageByJobRoleId: {},
  });
  const [banner, setBanner] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  async function loadCatalog() {
    setLoading(true);
    const res = await fetchInterviewModeCatalog();
    if (!res.ok) {
      setBanner({ type: "error", text: res.error });
      setLoading(false);
      return;
    }
    setCatalog(res.data);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function init() {
      const res = await fetchInterviewModeCatalog();
      if (!active) return;
      if (!res.ok) {
        setBanner({ type: "error", text: res.error });
      } else {
        setCatalog(res.data);
      }
      setLoading(false);
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  function handleSuccess(text) {
    setBanner({ type: "success", text });
  }

  function handleError(text) {
    setBanner({ type: "error", text });
  }

  async function executePendingAction() {
    if (!pendingAction?.action) return;
    setActionLoading(true);
    try {
      await pendingAction.action();
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  }

  const activeIndustriesCount = catalog.industries.filter((i) => i.is_active).length;
  const activeRolesCount = catalog.jobRoles.filter((r) => r.is_active).length;

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar />

      <main className="relative ml-20 flex max-w-7xl flex-col gap-7 px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Hero Header */}
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 fade-in-up sm:p-9">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-sky-400/15 via-indigo-400/12 to-cyan-400/12" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-100 to-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-sky-800 shadow-sm">
                <FaSlidersH className="text-sky-600 text-[11px]" />
                Android Interview Mode Dropdowns
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Industries &amp; Job Roles
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Add, edit, activate, or deactivate industries and job roles stored in Supabase. Active items sync directly with PrepMate AI&apos;s Android Select Industry and Job Role dropdowns.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={loadCatalog}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
              >
                <FaSyncAlt className={loading ? "animate-spin text-sky-600" : "text-sky-600"} />
                <span>Refresh from Supabase</span>
              </button>
              <Link
                to="/question-management"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-sky-500/25 transition hover:-translate-y-0.5 hover:shadow-sky-500/40"
              >
                <FaQuestionCircle className="text-xs" />
                <span>Question Management</span>
              </Link>
            </div>
          </div>

          {/* Summary Stat Cards */}
          <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[1.5rem] border border-sky-100/90 bg-gradient-to-br from-sky-50/80 via-white to-cyan-50/60 p-5 shadow-xs ring-1 ring-sky-200/50">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800">Active Industries</p>
                <FaIndustry className="text-sky-600" />
              </div>
              <p className="mt-2.5 text-3xl font-extrabold text-slate-950">{activeIndustriesCount}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{catalog.industries.length} total registered</p>
            </div>

            <div className="rounded-[1.5rem] border border-indigo-100/90 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-5 shadow-xs ring-1 ring-indigo-200/50">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Active Job Roles</p>
                <FaBriefcase className="text-indigo-600" />
              </div>
              <p className="mt-2.5 text-3xl font-extrabold text-slate-950">{activeRolesCount}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{catalog.jobRoles.length} total mapped</p>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-slate-50/60 p-5 shadow-xs sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Fixed Interview Settings</p>
                <FaLock className="text-slate-400" />
              </div>
              <p className="mt-2 text-xs font-bold text-slate-800">
                Categories: HR · Technical · Behavioral · Situational
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Difficulty Tiers: Easy · Medium · Hard (locked and preserved for consistent evaluation).
              </p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        {banner && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-xs font-bold shadow-sm ${
              banner.type === "error"
                ? "border-rose-200 bg-rose-50/90 text-rose-800"
                : "border-emerald-200 bg-emerald-50/90 text-emerald-800"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {banner.type === "error" ? (
                <FaExclamationTriangle className="text-sm shrink-0" />
              ) : (
                <FaCheckCircle className="text-sm shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="rounded-lg p-1 hover:bg-black/5"
              aria-label="Dismiss notification"
            >
              <FaTimes className="text-xs" />
            </button>
          </div>
        )}

        {/* Section Tabs & Content Card */}
        <section className="glass-card rounded-[2.25rem] border border-white/80 p-6 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.35)] ring-1 ring-sky-100/90 sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Industries and Job Roles Tabs">
              {TABS.map(({ key, label, icon: Icon }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(key)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white shadow-md shadow-sky-500/25"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-800"
                    }`}
                  >
                    <Icon className="text-xs" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] font-medium text-slate-500">
              Select Industry → Job Role (synced live to Android Interview Mode)
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-xs text-slate-500">
              <FaSyncAlt className="mb-2 animate-spin text-lg text-sky-600" />
              Loading Industries &amp; Job Roles from Supabase...
            </div>
          ) : (
            <>
              {activeTab === "industries" && (
                <IndustryManagerSection
                  industries={catalog.industries}
                  usageByIndustryId={catalog.usageByIndustryId}
                  onReload={loadCatalog}
                  onSuccess={handleSuccess}
                  onError={handleError}
                  onRequestConfirm={setPendingAction}
                />
              )}

              {activeTab === "job_roles" && (
                <JobRoleManagerSection
                  industries={catalog.industries}
                  jobRoles={catalog.jobRoles}
                  usageByJobRoleId={catalog.usageByJobRoleId}
                  onReload={loadCatalog}
                  onSuccess={handleSuccess}
                  onError={handleError}
                  onRequestConfirm={setPendingAction}
                />
              )}
            </>
          )}
        </section>
      </main>

      <ConfirmConfigActionModal
        pendingAction={pendingAction}
        loading={actionLoading}
        onCancel={() => setPendingAction(null)}
        onConfirm={executePendingAction}
      />
    </div>
  );
}
