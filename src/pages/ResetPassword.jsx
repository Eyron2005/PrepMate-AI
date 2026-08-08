import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash, FaLock } from "react-icons/fa";
import { supabase } from "../services/supabase";

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [isRecoveryValid, setIsRecoveryValid] = useState(false);

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
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.substring(1) : hash);
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    const type = params.get("type");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (error) {
      setErrorMessage(errorDescription || error);
      return;
    }

    if (type === "recovery" && access_token) {
      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      setIsRecoveryValid(true);
      setMessage("Reset link validated. Enter a new password.");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    setErrorMessage("Please open the reset link from your email to set a new password.");
  }, []);

  const handleResetPassword = async () => {
    setErrorMessage("");
    setMessage("");

    if (!isRecoveryValid) {
      setErrorMessage("The reset link is invalid or expired. Redirecting to login...");
      setTimeout(() => navigate("/"), 800);
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
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      setLoading(false);
      setErrorMessage(sessionError.message);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: password.trim() });
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage("Your password has been reset. Redirecting to login...");
    setTimeout(() => navigate("/"), 1200);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-28 h-28 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">Prepmate AI</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-center text-gray-800">Reset Password</h1>
          <p className="text-center text-gray-500 mt-2 mb-8">
            Enter your new password below to finish resetting your account.
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
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg transition disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full mt-3 border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white py-3 rounded-lg transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
