import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import Layout             from './components/Layout';
import Login              from './pages/Login';
import Register           from './pages/Register';
import Dashboard          from './pages/Dashboard';
import Workers            from './pages/Workers';
import WorkerForm         from './pages/WorkerForm';
import WorkerDetail       from './pages/WorkerDetail';
import GuarantorForm      from './pages/GuarantorForm';
import VerificationModule from './pages/VerificationModule';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <GoogleMapsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

              <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
                <Route path="/dashboard"                                      element={<Dashboard />} />
                <Route path="/workers"                                        element={<Workers />} />
                <Route path="/workers/new"                                    element={<WorkerForm />} />
                <Route path="/workers/:id"                                    element={<WorkerDetail />} />
                <Route path="/workers/:id/edit"                               element={<WorkerForm edit />} />
                <Route path="/workers/:id/verify"                             element={<VerificationModule />} />
                <Route path="/workers/:workerId/guarantors/new"               element={<GuarantorForm />} />
                <Route path="/workers/:workerId/guarantors/:guarantorId/edit" element={<GuarantorForm edit />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </GoogleMapsProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
