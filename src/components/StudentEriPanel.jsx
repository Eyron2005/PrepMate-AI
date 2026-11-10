import { FaGraduationCap, FaSyncAlt } from "react-icons/fa";
import {
  ERI_CATEGORIES,
  formatEriScore,
  getEriClassification,
} from "../services/eri";
import EriProgressRing from "./EriProgressRing";
import EriHistoryChart from "./EriHistoryChart";

const CATEGORY_MAP_FIELDS = {
  HR: "hr_average",
  Behavioral: "behavioral_average",
  Situational: "situational_average",
  Technical: "technical_average",
};

export default function StudentEriPanel({
  student,
  analytics,
  loading = false,
  spinnerClassName = "text-sky-600",
  emptyMessage = "This student has not finished a scored interview on PrepMate AI yet.",
}) {
  const source = analytics || student || {};
  const eriScore =
    source.latest_eri !== null &&
    source.latest_eri !== undefined &&
    Number.isFinite(Number(source.latest_eri))
      ? Number(source.latest_eri)
      : null;

  const hasEri = eriScore !== null;
  const classification = getEriClassification(eriScore);

  const validEvaluatedCount = Number(source.completed_assessments_count ?? 0);
  const totalCompletedCount = Number(
    source.total_completed_sessions ?? source.completed_assessments_count ?? 0
  );
  const incompleteCount = Number(source.incomplete_assessments_count ?? 0);
  const inProgressCount = Number(source.in_progress_assessments_count ?? 0);
  const history = Array.isArray(analytics?.history) ? analytics.history : [];

  const categoryValues = ERI_CATEGORIES.map((label) => {
    const field = CATEGORY_MAP_FIELDS[label];
    const raw = source[field];
    const value =
      raw !== null && raw !== undefined && Number.isFinite(Number(raw))
        ? Number(raw)
        : null;
    return { label, value };
  });

  const availableCategoriesCount = categoryValues.filter((c) => c.value !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Employment Readiness Index (ERI)
        </h4>
        {hasEri ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ${classification.badgeClass}`}
          >
            {classification.label}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200/80">
            N/A · No Completed ERI
          </span>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 via-white to-cyan-50/60 p-4 shadow-sm ring-1 ring-sky-200/50">
        {/* Completed vs Incomplete Session Integrity Strip */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Completed</p>
            <p className="mt-0.5 text-sm font-extrabold text-emerald-900 tabular-nums">
              {totalCompletedCount}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Incomplete</p>
            <p className="mt-0.5 text-sm font-extrabold text-amber-950 tabular-nums">
              {incompleteCount}
              {inProgressCount > 0 && (
                <span className="ml-1 text-[10px] font-semibold text-sky-700">
                  (+{inProgressCount} live)
                </span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Scored</p>
            <p className="mt-0.5 text-sm font-extrabold text-sky-900 tabular-nums">
              {validEvaluatedCount}
            </p>
          </div>
        </div>

        {/* Category Averages Grid (HR, Behavioral, Situational, Technical) */}
        <div className="rounded-xl border border-slate-200/70 bg-white/85 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Category Averages (Completed Only)
            </span>
            <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
              {availableCategoriesCount}/4 categories
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {categoryValues.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 text-center"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {label}
                </p>
                <p
                  className={`mt-0.5 text-sm font-extrabold tabular-nums ${
                    value !== null ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {formatEriScore(value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {hasEri ? (
          <div className="space-y-4">
            <div className="flex items-center justify-around gap-4 rounded-xl bg-white/85 p-3 ring-1 ring-slate-100">
              <EriProgressRing
                score={eriScore}
                size={92}
                strokeWidth={8}
                showLabel={false}
                classification={classification}
              />
              <div className="flex-1 space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Latest Completed Interview
                  </span>
                  <p className="font-semibold text-slate-800">
                    {source.latest_eri_date
                      ? new Date(source.latest_eri_date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Recent"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    How ERI Is Calculated
                  </span>
                  <p className="font-semibold text-slate-700">
                    {availableCategoriesCount === 4
                      ? "Average of all 4 categories"
                      : `Average of ${availableCategoriesCount} available categories`}
                  </p>
                </div>
              </div>
            </div>

            {/* ERI Historical Trend Chart (Completed sessions only) */}
            {loading ? (
              <div className="rounded-xl border border-slate-100 bg-white/70 p-6 text-center text-xs text-slate-400">
                <FaSyncAlt className={`mx-auto mb-1 animate-spin text-sm ${spinnerClassName}`} />
                Loading completed interviews...
              </div>
            ) : (
              <EriHistoryChart history={history} />
            )}
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-slate-100 bg-white/70 p-6 text-center text-xs text-slate-400">
            <FaSyncAlt className={`mx-auto mb-1 animate-spin text-sm ${spinnerClassName}`} />
            Loading completed assessments...
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center">
            <FaGraduationCap className="mx-auto mb-2 text-2xl text-slate-300" />
            <p className="text-xs font-bold text-slate-700">ERI: N/A</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {emptyMessage} Incomplete sessions remain visible in Interview Results and never affect ERI.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
