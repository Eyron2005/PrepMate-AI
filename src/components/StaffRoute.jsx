import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "../services/supabase";
import { useAuth } from "../contexts/authContext";

function StaffRoute() {
  const { session, isInitialized, authError } = useAuth();
  const [result, setResult] = useState({ userId: null, status: "checking" });

  useEffect(() => {
    let active = true;

    async function verifyStaff() {
      if (!session) {
        if (active) setResult({ userId: null, status: "denied" });
        return;
      }

      const { data: staff, error } = await supabase
        .from("staff")
        .select("id, is_active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error("Unable to verify staff access:", error);
        setResult({
          userId: session.user.id,
          status: "error",
          message: `Unable to verify staff access. Confirm the staff dashboard access migration has been applied. ${error.message}`,
        });
        return;
      }

      setResult({
        userId: session.user.id,
        status: staff && staff.is_active !== false ? "allowed" : "denied",
      });
    }

    if (isInitialized && !authError) verifyStaff();

    return () => {
      active = false;
    };
  }, [authError, isInitialized, session]);

  if (!isInitialized || (session && result.userId !== session.user.id)) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (authError || result.status === "error") {
    return (
      <main className="page-shell flex min-h-screen items-center justify-center px-4 text-slate-900">
        <p role="alert" className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-700">
          {authError
            ? `Unable to restore your session: ${authError.message}`
            : result.message}
        </p>
      </main>
    );
  }

  if (!session) return <Navigate to="/" replace />;
  if (result.userId !== session.user.id || result.status === "checking") {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return result.status === "allowed" ? <Outlet /> : <Navigate to="/" replace />;
}

export default StaffRoute;
