import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "../services/supabase";

function StaffRoute() {
  const [status, setStatus] = useState("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function verifyStaff() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Unable to check staff session:", sessionError);
        if (active) {
          setErrorMessage(`Unable to check your staff session: ${sessionError.message}`);
          setStatus("error");
        }
        return;
      }
      if (!session) {
        if (active) setStatus("denied");
        return;
      }

      const { data: staff, error } = await supabase
        .from("staff")
        .select("id, is_active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Unable to verify staff access:", error);
        if (active) {
          setErrorMessage(`Unable to verify staff access. Confirm the staff dashboard access migration has been applied. ${error.message}`);
          setStatus("error");
        }
        return;
      }

      if (active) setStatus(staff && staff.is_active !== false ? "allowed" : "denied");
    }

    verifyStaff();
    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
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

  return status === "allowed" ? <Outlet /> : <Navigate to="/" replace />;
}

export default StaffRoute;
