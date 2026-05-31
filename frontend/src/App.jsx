import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext';
import PlatformLogin     from './pages/platform/PlatformLogin';
import PlatformDashboard from './pages/platform/PlatformDashboard';
import Layout             from './components/Layout';
import Login              from './pages/Login';
import Register           from './pages/Register';
import Dashboard          from './pages/Dashboard';
import Workers            from './pages/Workers';
import WorkerForm         from './pages/WorkerForm';
import WorkerDetail       from './pages/WorkerDetail';
import GuarantorForm      from './pages/GuarantorForm';
import VerificationModule from './pages/VerificationModule';
import StaffManagement    from './pages/StaffManagement';
import ApprovalQueue      from './pages/ApprovalQueue';
import Branches           from './pages/Branches';
import Shifts             from './pages/Shifts';
import ActiveWorkers      from './pages/ActiveWorkers';
import WorkerPrint        from './pages/WorkerPrint';
import Payroll            from './pages/Payroll';
import Shortages           from './pages/Shortages';
import WorkerShortage      from './pages/WorkerShortage';
import WorkerDashboard     from './pages/WorkerDashboard';
import AttendanceDevices   from './pages/AttendanceDevices';
import AttendanceTerminal  from './pages/AttendanceTerminal';
import WorkerPortal        from './pages/WorkerPortal';
import WorkerPins          from './pages/WorkerPins';
import WorkerPinReset     from './pages/WorkerPinReset';
import Attendance         from './pages/Attendance';
import Breaks             from './pages/Breaks';
import StaffPolicy        from './pages/StaffPolicy';
import Offences           from './pages/Offences';
import OpsView            from './pages/OpsView';
import AdminPinLogin      from './pages/AdminPinLogin';
import AdminDashboard     from './pages/AdminDashboard';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );
  if (!user) {
    const dest = location.pathname + location.search;
    const to = (dest && dest !== '/' && dest !== '/login')
      ? `/login?redirect=${encodeURIComponent(dest)}`
      : '/login';
    return <Navigate to={to} replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

// Platform Admin guards — completely separate from main app auth
function PlatformPrivateRoute({ children }) {
  const { admin, loading } = usePlatformAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );
  return admin ? children : <Navigate to="/platform/login" replace />;
}

function PlatformPublicRoute({ children }) {
  const { admin, loading } = usePlatformAuth();
  if (loading) return null;
  return admin ? <Navigate to="/platform" replace /> : children;
}

// Super Admin only guard
function AdminRoute({ children }) {
  const { user, isSuperAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin()) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            {/* ── Platform Admin portal — completely isolated ────────────────── */}
            <Route path="/platform/*" element={
              <PlatformAuthProvider>
                <Routes>
                  <Route path="login" element={<PlatformPublicRoute><PlatformLogin /></PlatformPublicRoute>} />
                  <Route path=""      element={<PlatformPrivateRoute><PlatformDashboard /></PlatformPrivateRoute>} />
                  <Route path="*"     element={<Navigate to="/platform" replace />} />
                </Routes>
              </PlatformAuthProvider>
            } />

            {/* ── Main company app ──────────────────────────────────────────── */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/shortage"        element={<WorkerShortage />} />
            <Route path="/policy"          element={<StaffPolicy />} />
            <Route path="/ops"             element={<PrivateRoute><OpsView /></PrivateRoute>} />
            <Route path="/my-dashboard"    element={<WorkerDashboard />} />
            <Route path="/terminal" element={<AttendanceTerminal />} />
            <Route path="/worker"   element={<WorkerPortal />} />
            <Route path="/my-pin"   element={<WorkerPinReset />} />
            <Route path="/admin/:userId"  element={<AdminPinLogin />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />

            <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route path="/dashboard"     element={<Dashboard />} />
              <Route path="/workers"       element={<Workers />} />
              <Route path="/active-workers" element={<ActiveWorkers />} />
              <Route path="/branches"      element={<Branches />} />
              <Route path="/shifts"        element={<Shifts />} />
              <Route path="/payroll"       element={<Payroll />} />
              <Route path="/shortages"     element={<Shortages />} />
              <Route path="/attendance"    element={<Attendance />} />
              <Route path="/breaks"        element={<Breaks />} />
              <Route path="/offences"      element={<Offences />} />

              <Route path="/workers/new"                                    element={<WorkerForm />} />
              <Route path="/workers/:id"                                    element={<WorkerDetail />} />
              <Route path="/workers/:id/edit"                               element={<WorkerForm edit />} />
              <Route path="/workers/:id/print"                              element={<WorkerPrint />} />
              <Route path="/workers/:id/verify"                             element={<VerificationModule />} />
              <Route path="/workers/:workerId/guarantors/new"               element={<GuarantorForm />} />
              <Route path="/workers/:workerId/guarantors/:guarantorId/edit" element={<GuarantorForm edit />} />

              {/* Super Admin only */}
              <Route path="/approval-queue"       element={<AdminRoute><ApprovalQueue /></AdminRoute>} />
              <Route path="/staff"                element={<AdminRoute><StaffManagement /></AdminRoute>} />
              <Route path="/attendance-devices"   element={<AdminRoute><AttendanceDevices /></AdminRoute>} />
              <Route path="/worker-pins"          element={<AdminRoute><WorkerPins /></AdminRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
