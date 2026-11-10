import { createPortal } from "react-dom";
import { FaExclamationTriangle, FaPowerOff, FaArchive, FaTrash, FaTimes } from "react-icons/fa";

export default function ConfirmConfigActionModal({ pendingAction, loading, onCancel, onConfirm }) {
  if (!pendingAction) return null;

  const { variant = "warning", title, message, confirmLabel = "Confirm" } = pendingAction;

  const Icon =
    variant === "danger"
      ? FaTrash
      : variant === "archive"
        ? FaArchive
        : variant === "power"
          ? FaPowerOff
          : FaExclamationTriangle;

  const iconTone =
    variant === "danger"
      ? "bg-rose-100 text-rose-600"
      : variant === "archive"
        ? "bg-slate-100 text-slate-700"
        : "bg-amber-100 text-amber-700";

  const buttonTone =
    variant === "danger"
      ? "bg-rose-600 shadow-rose-600/30 hover:bg-rose-700"
      : variant === "archive"
        ? "bg-slate-800 shadow-slate-700/25 hover:bg-slate-900"
        : "bg-amber-600 shadow-amber-600/30 hover:bg-amber-700";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-config-action-title"
        className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/95 p-7 shadow-2xl ring-1 ring-slate-200/80 fade-in-up"
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconTone}`}>
            <Icon className="text-lg" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close confirmation dialog"
          >
            <FaTimes className="text-xs" />
          </button>
        </div>

        <h3 id="confirm-config-action-title" className="mt-4 text-xl font-extrabold text-slate-950">
          {title}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{message}</p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md transition disabled:opacity-60 ${buttonTone}`}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
