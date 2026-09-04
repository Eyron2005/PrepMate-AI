import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash, FaLock } from "react-icons/fa";
import { supabase } from "../services/supabase";

function ResetPassword() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [email, setEmail] = useState("");

  const passwordRules = [
    {
      label: "At least 8 characters",
      test: (value) => value.length >= 8,
    },
    {
      label: "At least one uppercase letter",
      test: (value) => /[A-Z]/.test(value),
    },
    {
      label: "At least one lowercase letter",
      test: (value) => /[a-z]/.test(value),
    },
    {
      label: "At least one number",
      test: (value) => /[0-9]/.test(value),
    },
    {
      label: "At least one special character (!@#$%^&*)",
      test: (value) => /[!@#$%^&*]/.test(value),
    },
  ];

  const passwordStatus = passwordRules.map((rule) => ({
    ...rule,
    valid: rule.test(password),
  }));

  const isPasswordStrong = passwordStatus.every((rule) => rule.valid);

  useEffect(() => {
    // Check if code is stored in localStorage from ForgotPassword flow
    const storedCode = localStorage.getItem("resetCode");
    const storedEmail = localStorage.getItem("resetEmail");
    if (storedCode) {
      setCode(storedCode);
    }
    if (storedEmail) {
      setEmail(storedEmail);
    }
  }, []);

  const handleVerifyCode = async () => {
    setErrorMessage("");
    setMessage("");

    if (!code.trim()) {
      setErrorMessage("Please enter the 6-digit code sent to your email.");
      return;
    }

    if (code.trim() !== localStorage.getItem("resetCode")) {
      setErrorMessage("The code is incorrect. Please try again.");
      return;
    }

    setCodeVerified(true);
    setMessage("Code verified! Now set your new password.");
  };

  const handleResetPassword = async () => {
    setErrorMessage("");
    setMessage("");

    if (!codeVerified) {
      setErrorMessage("Please verify your code first.");
      return;
    }

    if (!password.trim() || !confirmPassword.trim()) {
      setErrorMessage("Please fill in both password fields.");
      return;
    }

    if (!isPasswordStrong) {
      setErrorMessage("Your password does not meet the requirements.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // Get the user's email from localStorage
      const userEmail = localStorage.getItem("resetEmail") || email;

      // Update the password via Supabase auth
      const { error } = await supabase.auth.updateUserById(
        localStorage.getItem("resetUserId"),
        { password: password.trim() }
      );

      if (error) {
        setLoading(false);
        setErrorMessage(error.message || "Failed to reset password.");
        return;
      }

      setLoading(false);
      setMessage("Your password has been reset successfully. Redirecting to login...");
      
      // Clear stored data
      localStorage.removeItem("resetCode");
      localStorage.removeItem("resetEmail");
      localStorage.removeItem("resetUserId");
      
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      setLoading(false);
      setErrorMessage("An error occurred. Please try again.");
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
            {codeVerified ? "Reset Password" : "Verify Code"}
          </h1>

          <p className="text-center text-gray-500 mt-2 mb-8">
            {codeVerified ? "Enter your new password below." : "Enter the 6-digit code sent to your email."}
          </p>

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

          {/* Code Verification Step */}
          {!codeVerified ? (
            <>
              <div className="mb-6">
                <label className="block mb-2 font-medium text-slate-700">
                  Verification Code
                </label>
                <div className="flex items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-200">
                  <input
                    type="text"
                    maxLength="6"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-center text-2xl font-bold tracking-widest"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleVerifyCode}
                className="w-full rounded-3xl bg-gradient-to-r from-blue-600 to-teal-500 py-3 text-white font-semibold shadow-lg shadow-blue-500/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl"
              >
                Verify Code
              </button>
            </>
          ) : (
            <>
              {/* Password Reset Step */}
              <div className="mb-6">
                <label className="block mb-2 font-medium text-gray-700">New Password</label>
                <div className="flex items-center border rounded-lg px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                  <FaLock className="mr-3 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="ml-2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  {passwordStatus.map((rule) => (
                    <div key={rule.label} className="flex items-center gap-2">
                      <span
                        className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                          rule.valid ? "border-emerald-500 bg-emerald-500" : "border-gray-300"
                        }`}
                      >
                        {rule.valid ? <span className="text-white text-xs">✓</span> : ""}
                      </span>
                      <span className={rule.valid ? "text-emerald-700" : "text-gray-500"}>{rule.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block mb-2 font-medium text-gray-700">Confirm Password</label>
                <div className="flex items-center border rounded-lg px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                  <FaLock className="mr-3 text-gray-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="ml-2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                <p className={`mt-2 text-sm ${confirmPassword && password !== confirmPassword ? "text-red-600" : "text-gray-500"}`}>
                  {confirmPassword && password !== confirmPassword
                    ? "Passwords do not match"
                    : "Re-enter your password to confirm."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetPassword}
                disabled={loading || !isPasswordStrong}
                className="w-full rounded-3xl bg-gradient-to-r from-blue-600 to-teal-500 py-3 text-white font-semibold shadow-lg shadow-blue-500/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </>
          )}

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

export default ResetPassword;
