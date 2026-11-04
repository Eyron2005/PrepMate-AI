import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import UserManagement from "./pages/UserManagement";
import QuestionManagement from "./pages/QuestionManagement";
import StaffManagement from "./pages/StaffManagement";
import BackupRestore from "./pages/BackupRestore";
import AdminRoute from "./components/AdminRoute";
import StaffRoute from "./components/StaffRoute";
import StaffDashboard from "./pages/StaffDashboard";
import StaffStudentRecords from "./pages/StaffStudentRecords";
import StaffInterviewResults from "./pages/StaffInterviewResults";
import StaffAssignments from "./pages/StaffAssignments";
import AcceptStaffInvitation from "./pages/AcceptStaffInvitation";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route index element={<LoginPage />} />
        <Route path="/accept-staff-invitation" element={<AcceptStaffInvitation />} />

        {/* Admin-only pages */}
        <Route element={<AdminRoute />}>
          <Route path="/dashboard" element={<AdminDashboard />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/question-management" element={<QuestionManagement />} />
          <Route path="/staff-management" element={<StaffManagement />} />
          <Route path="/staff-assignments" element={<StaffAssignments />} />
          <Route path="/interview-results" element={<StaffInterviewResults isAdmin />} />
          <Route path="/backup-restore" element={<BackupRestore />} />
        </Route>

        {/* Staff-only workspace */}
        <Route element={<StaffRoute />}>
          <Route path="/staff-dashboard" element={<StaffDashboard />} />
          <Route path="/staff/student-records" element={<StaffStudentRecords />} />
          <Route path="/staff/interview-results" element={<StaffInterviewResults />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;