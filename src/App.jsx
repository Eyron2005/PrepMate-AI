import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import UserManagement from "./pages/UserManagement";
import QuestionManagement from "./pages/QuestionManagement";
import StaffManagement from "./pages/StaffManagement";
import OjtManagement from "./pages/OjtManagement";
import BackupRestore from "./pages/BackupRestore";
import SystemSettings from "./pages/SystemSettings";
import AdminRoute from "./components/AdminRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route index element={<LoginPage />} />

        {/* Admin-only pages */}
        <Route element={<AdminRoute />}>
          <Route path="/dashboard" element={<AdminDashboard />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/question-management" element={<QuestionManagement />} />
          <Route path="/staff-management" element={<StaffManagement />} />
          <Route path="/ojt-management" element={<OjtManagement />} />
          <Route path="/backup-restore" element={<BackupRestore />} />
          <Route path="/system-settings" element={<SystemSettings />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;