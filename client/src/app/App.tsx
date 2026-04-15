import { Toaster } from '@/components/ui/sonner';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import PublicOnlyRoute from '@/components/PublicOnlyRoute';
import { LandingPage } from '@/features/landing';
import { LoginPage, SignupPage, DoctorSetupPage } from '@/features/authentication';
import { PatientDashboard, AdminDashboard, DoctorDashboard } from '@/features/dashboard';
import PatientDiscover from '@/features/discover/PatientDiscover';
import PatientServiceBooking from '@/features/discover/PatientServiceBooking';

const App = () => (
  <Router>
    <AuthProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          {/* ── Public routes ───────────────────────────────────────────── */}
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <SignupPage />
              </PublicOnlyRoute>
            }
          />

          {/* Doctor invite setup — token arrives in URL hash, no prior auth needed */}
          <Route path="/doctor/setup" element={<DoctorSetupPage />} />

          {/* ── Protected: Patient ─────────────────────────────────────── */}
          <Route
            path="/patient/*"
            element={
          <ProtectedRoute allowedRole="patient">
                <Routes>
                  <Route path="dashboard" element={<PatientDashboard />} />
                  <Route path="discover" element={<PatientDiscover />} />
                  <Route path="services" element={<PatientServiceBooking />} />
                </Routes>
              </ProtectedRoute>
            }
          />

          {/* ── Protected: Doctor ──────────────────────────────────────── */}
          <Route
            path="/doctor/*"
            element={
              <ProtectedRoute allowedRole="doctor">
                <Routes>
                  <Route path="dashboard" element={<DoctorDashboard />} />
                  {/* Add more doctor-specific routes here */}
                </Routes>
              </ProtectedRoute>
            }
          />

          {/* ── Protected: Hospital Admin ──────────────────────────────── */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute allowedRole="hospital_admin">
                <Routes>
                  <Route path="dashboard" element={<AdminDashboard />} />
                  {/* Add more admin-specific routes here */}
                </Routes>
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <Toaster position="bottom-right" theme="dark" richColors={true} />
      </div>
    </AuthProvider>
  </Router>
);

export default App;
