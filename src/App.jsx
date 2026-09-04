import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
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