import { useState } from "react";
import { FaCalendarAlt, FaCheckCircle, FaComments, FaVideo } from "react-icons/fa";
import { formatEriScore } from "../services/eri";

export default function EriHistoryChart({ history = [] }) {
  const [activePoint, setActivePoint] = useState(null);

  if (!history || history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center text-xs">
        <p className="font-bold text-slate-700">No Completed Interviews Yet</p>
        <p className="mt-1 text-slate-500">
          Progress chart will appear once the student finishes a scored interview.
        </p>
      </div>
    );
  }

  // Single baseline assessment display
  if (history.length === 1) {
    const session = history[0];
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 ring-1 ring-sky-200/50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800">
              First Interview (1 Completed)
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${session.classification.badgeClass}`}>
              {formatEriScore(session.score)}
            </span>
          </div>
          {session.availableCategories?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {session.availableCategories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-sky-100"
                >
                  {cat}: {formatEriScore(session.categoryAverages?.[cat])}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs font-medium text-slate-700">
            {session.summary || "Completed evaluation session recorded."}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-sky-100 pt-2 text-[11px] text-slate-500">
            <span>{session.formattedDate} at {session.formattedTime}</span>
            <span>{session.completed_count} of {session.question_count} questions</span>
          </div>
        </div>
        <p className="text-center text-[11px] italic text-slate-400">
          Finish more interviews to see progress over time.
        </p>
      </div>
    );
  }

  // Chart Dimensions
  const height = 140;
  const width = 340;
  const paddingX = 30;
  const paddingY = 24;

  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const points = history.map((item, idx) => {
    const numeric = Number(item.score ?? 0);
    const clamped = Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
    const x = paddingX + (idx / (history.length - 1)) * innerWidth;
    const y = height - paddingY - (clamped / 100) * innerHeight;
    return { x, y, item };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return `${acc} ${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  return (
    <div className="space-y-4">
      {/* SVG Trend Line */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Readiness Progress ({history.length} Completed)
          </span>
          {activePoint && (
            <span className="text-xs font-bold text-sky-700 tabular-nums">
              {activePoint.item.formattedDate}: {formatEriScore(activePoint.item.score)}
            </span>
          )}
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible">

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeDasharray="3 3" />
          <line x1={paddingX} y1={paddingY + innerHeight / 2} x2={width - paddingX} y2={paddingY + innerHeight / 2} stroke="#f1f5f9" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#e2e8f0" />

          {/* Area under curve */}
          <path d={areaD} fill="#0284c7" fillOpacity="0.12" />

          {/* Connected Line */}
          <path d={pathD} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Points */}
          {points.map((pt, idx) => (
            <g
              key={pt.item.id || idx}
              className="cursor-pointer"
              onMouseEnter={() => setActivePoint(pt)}
              onMouseLeave={() => setActivePoint(null)}
            >
              <circle
                cx={pt.x}
                cy={pt.y}
                r={activePoint?.item?.id === pt.item.id ? 6 : 4}
                fill="#ffffff"
                stroke={pt.item.classification.progressColor}
                strokeWidth={activePoint?.item?.id === pt.item.id ? 3 : 2}
                className="transition-all duration-200"
              />
            </g>
          ))}
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between px-6 pt-1 text-[10px] font-semibold text-slate-400">
          <span>{history[0].formattedDate}</span>
          <span>{history[history.length - 1].formattedDate}</span>
        </div>
      </div>

      {/* Chronological List of Completed Interviews */}
      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Completed Assessments
        </p>
        {history.slice().reverse().map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs transition hover:bg-white hover:shadow-sm"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 truncate font-bold text-slate-800">
                <FaCalendarAlt className="shrink-0 text-[10px] text-slate-400" />
                <span>{session.formattedDate}</span>
                <span className="text-[11px] font-normal text-slate-400">({session.formattedTime})</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <FaCheckCircle className="text-[9px] text-emerald-500" />
                  {session.completed_count}/{session.question_count} Qs
                </span>
                {session.speech_score != null && (
                  <span className="inline-flex items-center gap-1">
                    <FaComments className="text-[9px] text-sky-500" />
                    Speech: {formatEriScore(session.speech_score)}
                  </span>
                )}
                {session.camera_score != null && (
                  <span className="inline-flex items-center gap-1">
                    <FaVideo className="text-[9px] text-indigo-500" />
                    Cam: {formatEriScore(session.camera_score)}
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums ${session.classification.badgeClass}`}>
                {formatEriScore(session.score)}
              </span>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                {session.classification.shortLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
