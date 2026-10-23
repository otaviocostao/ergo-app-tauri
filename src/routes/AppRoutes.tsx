import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import PageLoading from "../components/PageLoading";
import MainLayout from "../components/MainLayout";
import Dashboard from "../pages/Dashboard";
import Reports from "../pages/Reports";
import Reminders from "../pages/Reminders";
import Monitoring from "../pages/Monitoring";
import Settings from "../pages/Settings";
import Register from "../pages/Register";
import Login from "../pages/Login";
import AuthLayout from "../components/auth/AuthLayout";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";

function RequireSession() {
  const { session } = useAuth();
  return session.kind === "authenticated"
    ? <Outlet />
    : <Navigate to="/login" replace />;
}

function AnonymousOnly() {
  const { session } = useAuth();
  return session.kind === "authenticated" ? <Navigate to="/" replace /> : <AuthLayout />;
}

export default function AppRoutes() {
  const { loading } = useAuth();
  const { isInitializing: themeInitializing } = useTheme();
  if (loading || themeInitializing) {
    return <PageLoading fullScreen />;
  }
  return (
    <Routes>
      <Route element={<AnonymousOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
      </Route>
      <Route element={<RequireSession />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/dashboard/indice-ergonomico" element={<Navigate to="/reports?view=index&period=day" replace />} />
          <Route path="/dashboard/boa-postura" element={<Navigate to="/reports?view=posture&period=day" replace />} />
          <Route path="/dashboard/alertas-preventivos" element={<Navigate to="/reports?view=alerts&period=day" replace />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/ergonomic-notices" element={<Navigate to="/settings?tab=notices" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
