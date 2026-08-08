import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import AdminDashboard from "./pages/AdminDashboard";
import UserManagement from "./pages/UserManagement";
import QuestionManagement from "./pages/QuestionManagement";
import ResetPassword from "./pages/ResetPassword";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route index element={<LoginPage />} />

        {/* Register */}
        <Route path="/register" element={<SignUp />} />

        {/* Forgot Password */}
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<AdminDashboard />} />

        {/* User Management */}
        <Route path="/user-management" element={<UserManagement />} />

        {/* Question Management */}
        <Route path="/question-management" element={<QuestionManagement />} />

        {/* Reset Password */}
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;