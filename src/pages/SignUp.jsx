import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import { supabase } from "../services/supabase";

function SignUp() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Show / Hide password states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRegister = async () => {
    setErrorMessage("");

    // Validation
    if (!fullName || !email || !password || !confirmPassword) {
      setErrorMessage("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    try {
      // Create user in Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      // Make sure user exists
      if (!data.user) {
        setErrorMessage("User was not created.");
        return;
      }

      // Insert into admins table
      const { error: adminError } = await supabase
        .from("admins")
        .insert([
          {
            id: data.user.id,
            full_name: fullName,
            role: "admin",
            is_active: true,
          },
        ]);

      if (adminError) {
        console.error("Admin Insert Error:", adminError);
        setErrorMessage(adminError.message);
        return;
      }

      navigate("/");
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md fade-in-up">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shadow-2xl shadow-blue-200/40">
            <span className="text-white text-lg font-bold text-center">
              Prepmate AI
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">

          <h1 className="text-3xl font-bold text-center">
            Sign Up as Admin
          </h1>

          <p className="text-center text-gray-500 mt-2 mb-8">
            Create a new administrator account.
          </p>

          {errorMessage && (
            <div className="mb-6 rounded-3xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-800 shadow-sm">
              {errorMessage}
            </div>
          )}

          {/* Full Name */}
          <div className="mb-4">
            <label className="block mb-2">Full Name</label>

            <div className="flex items-center border rounded-lg px-4 py-3">
              <FaUser className="mr-3 text-gray-400" />

              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full outline-none"
              />
            </div>
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className="block mb-2">Email</label>

            <div className="flex items-center border rounded-lg px-4 py-3">
              <FaEnvelope className="mr-3 text-gray-400" />

              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full outline-none"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block mb-2">Password</label>

            <div className="flex items-center border rounded-lg px-4 py-3">
              <FaLock className="mr-3 text-gray-400" />

              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full outline-none"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="ml-3 text-gray-400 hover:text-blue-600 transition"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="mb-6">
            <label className="block mb-2">Confirm Password</label>

            <div className="flex items-center border rounded-lg px-4 py-3">
              <FaLock className="mr-3 text-gray-400" />

              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full outline-none"
              />

              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword(!showConfirmPassword)
                }
                className="ml-3 text-gray-400 hover:text-blue-600 transition"
                aria-label={
                  showConfirmPassword
                    ? "Hide confirm password"
                    : "Show confirm password"
                }
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {/* Sign Up */}
          <button
            onClick={handleRegister}
            className="w-full rounded-3xl bg-gradient-to-r from-blue-600 to-teal-500 py-3 text-white font-semibold shadow-lg shadow-blue-500/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-xl"
          >
            Sign Up
          </button>

          {/* Back to Login */}
          <button
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

export default SignUp;