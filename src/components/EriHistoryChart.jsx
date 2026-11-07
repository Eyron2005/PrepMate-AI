import { useState } from "react";
import { FaCalendarAlt, FaCheckCircle, FaComments, FaVideo } from "react-icons/fa";

export default function EriHistoryChart({ history = [] }) {
  const [activePoint, setActivePoint] = useState(null);

  if (!history || history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center text-xs">
        <p className="font-bold text-slate-700">No Assessment History Available</p>
        <p className="mt-1 text-slate-500">
          Historical trend line will be charted once the candidate completes mock interview evaluations.
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
              Baseline Assessment (1 Completed)
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${session.classification.badgeClass}`}>
              {session.score}%
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-700">
            {session.summary || "Completed evaluation session recorded."}
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-sky-100 pt-2">
            <span>{session.formattedDate} at {session.formattedTime}</span>
            <span>{session.completed_count} of {session.question_count} questions</span>
          </div>
        </div>
        <p className="text-[11px] italic text-slate-400 text-center">
          Additional interview sessions will populate the chronological progress trend line.
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
    const x = paddingX + (idx / (history.length - 1)) * innerWidth;
    const y = height - paddingY - (item.score / 100) * innerHeight;
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
            Readiness Trend Line ({history.length} Assessments)
          </span>
          {activePoint && (
            <span className="text-xs font-bold text-sky-700">
              {activePoint.item.formattedDate}: {activePoint.item.score}%
            </span>
          )}
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="eriGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeDasharray="3 3" />
          <line x1={paddingX} y1={paddingY + innerHeight / 2} x2={width - paddingX} y2={paddingY + innerHeight / 2} stroke="#f1f5f9" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#e2e8f0" />

          {/* Area under curve */}
          <path d={areaD} fill="url(#eriGradient)" />

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
        <div className="flex justify-between px-6 pt-1 text-[10px] text-slate-400 font-semibold">
          <span>{history[0].formattedDate}</span>
          <span>{history[history.length - 1].formattedDate}</span>
        </div>
      </div>

      {/* Chronological List of Assessments */}
      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Chronological Assessments
        </p>
        {history.slice().reverse().map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs transition hover:bg-white hover:shadow-sm"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                <FaCalendarAlt className="text-[10px] text-slate-400 shrink-0" />
                <span>{session.formattedDate}</span>
                <span className="text-[11px] font-normal text-slate-400">({session.formattedTime})</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <FaCheckCircle className="text-emerald-500 text-[9px]" />
                  {session.completed_count}/{session.question_count} Qs
                </span>
                {session.speech_score != null && (
                  <span className="inline-flex items-center gap-1">
                    <FaComments className="text-sky-500 text-[9px]" />
                    Speech: {session.speech_score}%
                  </span>
                )}
                {session.camera_score != null && (
                  <span className="inline-flex items-center gap-1">
                    <FaVideo className="text-indigo-500 text-[9px]" />
                    Cam: {session.camera_score}%
                  </span>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-extrabold ${session.classification.badgeClass}`}>
                {session.score}%
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
