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

    try {
      const { data, error } = await supabase.functions.invoke("send-password-code", {
        body: { email: email.trim() },
      });

      let responseData = data;
      if (error?.context?.json) {
        try {
          responseData = await error.context.json();
        } catch {
          responseData = data;
        }
      }

      if (error || !responseData?.success) {
        setErrorMessage(
          responseData?.error ||
            responseData?.message ||
            error?.message ||
            "Failed to send verification code."
        );
        return;
      }

      // Store code and email in localStorage for next step
      if (responseData?.code) {
        localStorage.setItem("resetCode", responseData.code);
        localStorage.setItem("resetEmail", email.trim());
      }

      setMessage("If this email is registered, a 6-digit verification code has been sent.");
      setTimeout(() => navigate("/reset-password"), 1500);
    } catch (error) {
      setErrorMessage(error.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md fade-in-up">

        {/* Logo */}
        <div className="mb-7 flex justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-500 text-center text-sm font-black tracking-[0.22em] text-white shadow-[0_24px_40px_-20px_rgba(37,99,235,0.85)] ring-4 ring-white/70">
              Prepmate
            </div>
          </div>


        {/* Card */}
        <div className="glass-card rounded-[2rem] border border-white/70 shadow-[0_35px_100px_-40px_rgba(15,23,42,0.4)] p-8">

          <h1 className="text-3xl font-bold text-center text-slate-900">
            Forgot Password
          </h1>

          <p className="text-center text-gray-500 mt-2 mb-8">
            Enter your email address and we'll send you a 6-digit verification code.
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
            disabled={loading}
            className="w-full rounded-3xl bg-gradient-to-r from-blue-600 to-teal-500 py-3 text-white font-semibold shadow-lg shadow-blue-500/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl"
          >
            {loading ? "Sending..." : "Send Verification Code"}
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