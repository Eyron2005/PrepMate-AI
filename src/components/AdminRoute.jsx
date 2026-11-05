import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "../services/supabase";
import { useAuth } from "../contexts/authContext";

function AdminRoute() {
  const [status, setStatus] = useState("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [verifiedUserId, setVerifiedUserId] = useState(null);
  const { session, loading, error: authError } = useAuth();
  const userId = session?.user?.id;

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      setStatus("checking");
      setErrorMessage("");
      try {
        const { data: admin, error } = await supabase
          .from("admins")
          .select("id, is_active")
          .eq("id", userId)
          .maybeSingle();

        if (error) throw error;
        if (active) {
          setVerifiedUserId(userId);
          setStatus(admin && admin.is_active !== false ? "allowed" : "denied");
        }
      } catch (error) {
        console.error("Unable to verify admin access:", error);
        if (active) {
          setVerifiedUserId(userId);
          setErrorMessage(`Unable to verify admin access: ${error.message}`);
          setStatus("error");
        }
      }
    }

    if (userId) verifyAdmin();

    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (authError) {
    return (
      <main className="page-shell flex min-h-screen items-center justify-center px-4 text-slate-900">
        <p role="alert" className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-700">
          Unable to restore your session: {authError.message}
        </p>
      </main>
    );
  }

  if (!session) return <Navigate to="/" replace />;

  if (status === "checking" || verifiedUserId !== userId) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (status === "error") {
    return (
      <main className="page-shell flex min-h-screen items-center justify-center px-4 text-slate-900">
        <p role="alert" className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      </main>
    );
  }

  return status === "allowed"
    ? <Outlet />
    : <Navigate to="/" replace />;
}

export default AdminRoute;