import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminRoute from "./components/AdminRoute";
import StaffRoute from "./components/StaffRoute";
import { AuthProvider } from "./contexts/AuthProvider";
import { PresenceProvider } from "./contexts/PresenceProvider";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const QuestionManagement = lazy(() => import("./pages/QuestionManagement"));
const StaffManagement = lazy(() => import("./pages/StaffManagement"));
const BackupRestore = lazy(() => import("./pages/BackupRestore"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const StaffStudentRecords = lazy(() => import("./pages/StaffStudentRecords"));
const AdminInterviewResults = lazy(() => import("./pages/AdminInterviewResults"));
const StaffAssignments = lazy(() => import("./pages/StaffAssignments"));
const AcceptStaffInvitation = lazy(() => import("./pages/AcceptStaffInvitation"));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={
          <div
            className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500"
            role="status"
            aria-busy="true"
          >
            Loading page...
          </div>
        }>
          <Routes>
            <Route index element={<LoginPage />} />
            <Route path="/accept-staff-invitation" element={<AcceptStaffInvitation />} />

            <Route element={<AdminRoute />}>
              <Route path="/dashboard" element={<AdminDashboard />} />
              <Route
                path="/user-management"
                element={<PresenceProvider><UserManagement /></PresenceProvider>}
              />
              <Route path="/question-management" element={<QuestionManagement />} />
              <Route path="/staff-management" element={<StaffManagement />} />
              <Route path="/staff-assignments" element={<StaffAssignments />} />
              <Route path="/interview-results" element={<AdminInterviewResults />} />
              <Route path="/backup-restore" element={<BackupRestore />} />
            </Route>

            <Route element={<StaffRoute />}>
              <Route path="/staff-dashboard" element={<StaffDashboard />} />
              <Route path="/staff/student-records" element={<StaffStudentRecords />} />
              <Route path="/staff/interview-results" element={<AdminInterviewResults isStaff />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;