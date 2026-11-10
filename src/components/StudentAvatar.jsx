import { useState } from "react";
import { getStudentInitials, resolveStudentAvatarUrl } from "../services/avatar";

export default function StudentAvatar({
  avatarUrl,
  name,
  isDeactivated = false,
  size = "md",
}) {
  const [failedUrl, setFailedUrl] = useState(null);
  const resolvedUrl = resolveStudentAvatarUrl(avatarUrl);
  const isLg = size === "lg";

  const sizeClasses = isLg ? "h-14 w-14" : "h-9 w-9";
  const badgeRadius = isLg ? "rounded-2xl" : "rounded-xl";
  const textClasses = isLg ? "text-xl font-extrabold" : "text-xs font-bold";
  const bgClasses = isDeactivated
    ? "bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-500/20"
    : "bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/30";

  const hasFailed = Boolean(resolvedUrl && failedUrl === resolvedUrl);

  if (resolvedUrl && !hasFailed) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full ${sizeClasses} shadow-sm ring-2 ${
          isDeactivated ? "ring-slate-300" : "ring-sky-200"
        } bg-slate-100 flex items-center justify-center`}
      >
        <img
          src={resolvedUrl}
          alt={name || "Student profile photo"}
          onError={() => setFailedUrl(resolvedUrl)}
          className="h-full w-full object-cover rounded-full"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center text-white shadow-sm ${sizeClasses} ${badgeRadius} ${textClasses} ${bgClasses}`}
    >
      {getStudentInitials(name)}
    </div>
  );
}
