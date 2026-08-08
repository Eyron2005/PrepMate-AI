import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import { supabase } from "../services/supabase";

function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Login Function
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

  // Register Function
  const handleRegister = () => {
    navigate("/register");
  };

  // Forgot Password Function
  const handleForgotPassword = () => {
    navigate("/forgot-password");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md fade-in-up">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shadow-2xl shadow-blue-200/40">
            <span className="text-white text-lg font-bold text-center">
              Prepmate AI
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card rounded-[2rem] border border-white/70 shadow-[0_35px_100px_-40px_rgba(15,23,42,0.4)] p-8">

          <h1 className="text-3xl font-bold text-center text-slate-900">
            Welcome Back
          </h1>
          {errorMessage && (
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-800 shadow-sm">
              {errorMessage}
            </div>
          )}
          {/* Email */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email
            </label>

            <div className="flex items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-200">
              <FaEnvelope className="text-slate-400 mr-3" />

              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Password
            </label>

            <div className="relative flex items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-200">
              <FaLock className="text-slate-400 mr-3" />

              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="ml-3 text-slate-500 hover:text-slate-900"
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleLogin}
              className="w-full rounded-3xl bg-gradient-to-r from-blue-600 to-teal-500 py-3 text-white font-semibold shadow-lg shadow-blue-500/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl"
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={handleRegister}
              className="w-full rounded-3xl border border-blue-600 bg-white py-3 text-blue-600 font-semibold shadow-sm transition hover:bg-blue-600 hover:text-white"
            >
              Register
            </button>
          </div>

        </div>

        {/* Forgot Password */}
        <p className="text-center text-slate-500 mt-6 text-sm">
          Forgot your password?{" "}
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-blue-600 font-semibold hover:underline"
          >
            Reset Password
          </button>
        </p>

      </div>
    </div>
  );
}

export default LoginPage;