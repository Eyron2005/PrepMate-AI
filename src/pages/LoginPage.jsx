import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaArrowRight, FaShieldAlt, FaSpinner } from "react-icons/fa";
import { supabase } from "../services/supabase";
import { useAuth } from "../contexts/authContext";

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading, error: authError } = useAuth();
  const userId = session?.user?.id;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (authError || !userId) return;

    let active = true;

    async function restoreDestination() {
      try {
        const { data: admin, error: adminError } = await supabase
          .from("admins")
          .select("id, is_active")
          .eq("id", userId)
          .maybeSingle();

        if (adminError) throw adminError;
        if (admin && admin.is_active !== false) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const { data: staff, error: staffError } = await supabase
          .from("staff")
          .select("id, is_active")
          .eq("id", userId)
          .maybeSingle();

        if (staffError) throw staffError;
        if (staff && staff.is_active !== false) {
          navigate("/staff-dashboard", { replace: true });
          return;
        }

        if (active) setErrorMessage("This account does not have admin or staff access.");
      } catch (error) {
        console.error("Unable to restore the account role:", error);
        if (active) setErrorMessage(`Unable to verify your account role: ${error.message}`);
      }
    }

    restoreDestination();
    return () => {
      active = false;
    };
  }, [authError, authLoading, navigate, userId]);

  const handleLogin = async () => {
    setErrorMessage("");

    if (!email || !password) {
      setErrorMessage("Please enter your email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }

      const userId = data?.user?.id;
      const { data: admin, error: adminLookupError } = await supabase
        .from("admins")
        .select("id, is_active")
        .eq("id", userId)
        .maybeSingle();

      if (adminLookupError) {
        console.error("Unable to verify account role:", adminLookupError);
        setErrorMessage(`Unable to verify your account role: ${adminLookupError.message}`);
        setIsSubmitting(false);
        return;
      }

      const isAdmin = admin && admin.is_active !== false;
      let isStaff = false;
      if (!isAdmin) {
        const { data: staff, error: staffLookupError } = await supabase
          .from("staff")
          .select("id, is_active")
          .eq("id", userId)
          .maybeSingle();

        if (staffLookupError) {
          console.error("Unable to verify staff account:", staffLookupError);
          setErrorMessage(`Unable to verify staff access: ${staffLookupError.message}`);
          setIsSubmitting(false);
          return;
        }
        isStaff = Boolean(staff && staff.is_active !== false);
      }

      if (!isAdmin && !isStaff) {
        setErrorMessage("This account does not have admin or staff access.");
        setIsSubmitting(false);
        return;
      }

      const lastOnline = new Date().toISOString();
      if (userId && isAdmin) {
        try {
          const { error: adminUpdateError } = await supabase
            .from("admins")
            .update({ last_online: lastOnline })
            .eq("id", userId);
          if (adminUpdateError) console.warn("Could not update admin last_online:", adminUpdateError);
        } catch (adminUpdateError) {
          console.warn("Could not update admin last_online:", adminUpdateError);
        }

        try {
          const { data: updatedProfiles, error: profileUpdateError } = await supabase
            .from("profiles")
            .update({ last_online: lastOnline, email, emails: email })
            .eq("id", userId)
            .select("id, last_online");

          if (profileUpdateError) {
            console.warn("Could not update profile last_online by id:", profileUpdateError);
          } else if (!updatedProfiles || updatedProfiles.length === 0) {
            console.warn("No profile row updated by id. Trying email fallback.", { userId, email });

            const { data: profileByEmail, error: findByEmailError } = await supabase
              .from("profiles")
              .select("id")
              .or(`email.eq.${email},emails.eq.${email}`)
              .single();

            if (findByEmailError) {
              console.warn("Could not find profile by email to update last_online:", findByEmailError);
            } else if (profileByEmail?.id) {
              const { data: fallbackData, error: fallbackUpdateError } = await supabase
                .from("profiles")
                .update({ last_online: lastOnline, email, emails: email })
                .eq("id", profileByEmail.id)
                .select("id, last_online");

              if (fallbackUpdateError) {
                console.warn("Could not update profile last_online by email fallback:", fallbackUpdateError);
              } else {
                console.log("Profile last_online updated by email fallback:", fallbackData);
              }
            }
          } else {
            console.log("Profile last_online updated by id:", updatedProfiles);
          }
        } catch (profileUpdateError) {
          console.warn("Could not update profile last_online:", profileUpdateError);
        }
      }

      navigate(isAdmin ? "/dashboard" : "/staff-dashboard");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="page-shell relative flex min-h-screen items-center justify-center px-4 py-12 text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <div className="relative mx-auto w-full max-w-md fade-in-up">
        {/* Brand Showcase */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-24 w-24 items-center justify-center rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
            <img
              alt="Prepmate logo"
              src="/PrepmateLogo.svg"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.25em] text-sky-800 shadow-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            PrepMate AI Portal
          </div>
        </div>

        {/* Login Card */}
        <div className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-slate-200 p-8 shadow-sm sm:p-10">
          <div className="absolute inset-x-0 top-0 h-2 bg-blue-600" />

          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Welcome Back</h1>
            <p className="mt-2 text-sm text-slate-600">Sign in with your email and password to continue</p>
          </div>

          {(errorMessage || (authError && `Unable to restore your session: ${authError.message}`)) && (
            <div className="mb-6 rounded-2xl border border-rose-200/90 bg-rose-50/95 p-3.5 text-xs font-semibold text-rose-700 shadow-sm" role="alert">
              {errorMessage || `Unable to restore your session: ${authError.message}`}
            </div>
          )}

          <div className="space-y-5" onKeyDown={handleKeyDown}>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">Email Address</label>
              <div className="flex items-center rounded-2xl border border-slate-200/90 bg-slate-50/70 px-4 py-3 shadow-inner shadow-slate-100 transition-all duration-200 focus-within:border-sky-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-sky-500/15">
                <FaEnvelope className="mr-3 text-slate-400" />
                <input
                  type="email"
                  placeholder="admin@prepmate.site"
                  value={email}
                  disabled={isSubmitting}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">Password</label>
              <div className="relative flex items-center rounded-2xl border border-slate-200/90 bg-slate-50/70 px-4 py-3 shadow-inner shadow-slate-100 transition-all duration-200 focus-within:border-sky-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-sky-500/15">
                <FaLock className="mr-3 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={password}
                  disabled={isSubmitting}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="ml-3 rounded-lg p-1 text-slate-400 transition hover:text-slate-700 focus:outline-none"
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleLogin}
                disabled={isSubmitting}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-blue-600 hover:bg-blue-700 py-3.5 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:shadow hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <FaSpinner className="animate-spin text-sm" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <FaArrowRight className="text-xs transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Security Badge */}
          <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-center text-[11px] font-medium text-slate-500">
            <FaShieldAlt className="text-sky-600" />
            <span>Secure Admin &amp; Staff Sign-In</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
