import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaArrowRight } from "react-icons/fa";
import { supabase } from "../services/supabase";

function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async () => {
    setErrorMessage("");

    if (!email || !password) {
      setErrorMessage("Please enter your email and password.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const userId = data?.user?.id;
    const lastOnline = new Date().toISOString();

    if (userId) {
      try {
        const { data: adminUpdateData, error: adminUpdateError } = await supabase
          .from("admins")
          .update({ last_online: lastOnline })
          .eq("id", userId)
          .select("id, last_online");

        if (adminUpdateError) {
          console.warn("Could not update admin last_online:", adminUpdateError);
        } else {
          console.log("Admin last_online updated:", adminUpdateData);
        }
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

    navigate("/dashboard");
  };

  const handleRegister = () => {
    navigate("/register");
  };

  const handleForgotPassword = () => {
    navigate("/forgot-password");
  };

  return (
    <div className="page-shell relative min-h-screen overflow-hidden px-4 py-10 text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <div className="relative mx-auto flex max-w-5xl items-center justify-center">
        <div className="w-full max-w-md fade-in-up">
          <div className="mb-7 flex justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-500 text-center text-sm font-black tracking-[0.22em] text-white shadow-[0_24px_40px_-20px_rgba(37,99,235,0.85)] ring-4 ring-white/70">
              Prepmate
            </div>
          </div>

          <div className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-[0_35px_100px_-40px_rgba(15,23,42,0.45)] ring-1 ring-sky-100/80">
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-sky-700">Admin Portal</p>
              <h1 className="mt-4 text-3xl font-bold text-slate-900">Welcome back</h1>
              <p className="mt-2 text-sm text-slate-600">Sign in to continue to your dashboard</p>
            </div>

            {errorMessage && (
              <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/90 p-3 text-sm font-medium text-rose-700 shadow-sm">
                {errorMessage}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <div className="flex items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                  <FaEnvelope className="mr-3 text-slate-400" />
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <div className="relative flex items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                  <FaLock className="mr-3 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="ml-3 text-slate-500 transition hover:text-slate-900"
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleLogin}
                className="flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-500 py-3.5 text-base font-semibold text-white shadow-[0_18px_28px_-18px_rgba(37,99,235,0.9)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-18px_rgba(14,165,233,0.9)]"
              >
                Sign In <FaArrowRight className="text-sm" />
              </button>

              <button
                type="button"
                onClick={handleRegister}
                className="w-full rounded-3xl border border-sky-600 bg-white py-3 text-base font-semibold text-sky-700 shadow-sm transition hover:bg-sky-600 hover:text-white"
              >
                Sign Up
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            Forgot your password?{" "}
            <button
              type="button"
              onClick={handleForgotPassword}
              className="font-semibold text-sky-700 hover:underline"
            >
              Reset Password
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;