import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import UserManagement from "./pages/UserManagement";
import QuestionManagement from "./pages/QuestionManagement";
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
        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;