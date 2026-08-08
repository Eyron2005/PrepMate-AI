import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEnvelope } from "react-icons/fa";
import { supabase } from "../services/supabase";

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setErrorMessage("");
    setMessage("");

    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage("If this email is registered, a reset link has been sent.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md fade-in-up">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shadow-2xl shadow-blue-200/40">
            <span className="text-white text-2xl font-bold">Prepmate AI</span>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card rounded-[2rem] border border-white/70 shadow-[0_35px_100px_-40px_rgba(15,23,42,0.4)] p-8">

          <h1 className="text-3xl font-bold text-center text-slate-900">
            Forgot Password
          </h1>

          <p className="text-center text-gray-500 mt-2 mb-8">
            Enter your email address and we'll send you a password reset link.
          </p>

          {/* Email */}
          <div className="mb-6">
            <label className="block mb-2 font-medium text-slate-700">
              Email
            </label>

            <div className="flex items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-200">
              <FaEnvelope className="mr-3 text-slate-400" />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {errorMessage}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="w-full rounded-3xl bg-gradient-to-r from-blue-600 to-teal-500 py-3 text-white font-semibold shadow-lg shadow-blue-500/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl"
          >
            Send Reset Link
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full mt-3 rounded-3xl border border-blue-600 bg-white py-3 text-blue-600 font-semibold shadow-sm transition hover:bg-blue-600 hover:text-white"
          >
            Back to Login
          </button>

        </div>

      </div>
    </div>
  );
}

export default ForgotPassword;