import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "../services/supabase";

function AdminRoute() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (active) setStatus("denied");
        return;
      }

      const { data: admin, error } = await supabase
        .from("admins")
        .select("id, is_active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error || !admin || admin.is_active === false) {
        await supabase.auth.signOut();
        if (active) setStatus("denied");
        return;
      }

      if (active) setStatus("allowed");
    }

    verifyAdmin();

    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return status === "allowed" ? <Outlet /> : <Navigate to="/" replace />;
}

export default AdminRoute;