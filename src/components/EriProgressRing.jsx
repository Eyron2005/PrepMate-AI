export default function EriProgressRing({
  score,
  size = 100,
  strokeWidth = 8,
  showLabel = true,
  classification,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const hasScore = score !== null && score !== undefined && Number.isFinite(Number(score));
  const numericScore = hasScore ? Math.min(100, Math.max(0, Math.round(Number(score)))) : 0;
  const strokeDashoffset = circumference - (numericScore / 100) * circumference;

  const color = classification?.progressColor || (hasScore ? "#0284c7" : "#94a3b8");

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Arc */}
          {hasScore && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-out"
            />
          )}
        </svg>

        {/* Center Percentage */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {hasScore ? `${numericScore}%` : "—"}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            ERI
          </span>
        </div>
      </div>

      {showLabel && classification && (
        <span
          className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${classification.badgeClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${classification.dotClass}`} />
          {classification.label}
        </span>
      )}
    </div>
  );
}
