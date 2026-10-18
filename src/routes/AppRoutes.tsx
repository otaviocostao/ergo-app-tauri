import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import PageLoading from "../components/PageLoading";
import Login from "../pages/Login";
import AuthLayout from "../components/auth/AuthLayout";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";

const MainLayout = lazy(() => import("../components/MainLayout"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const ErgonomicIndex = lazy(() => import("../pages/ErgonomicIndex"));
const GoodPosture = lazy(() => import("../pages/GoodPosture"));
const PreventiveAlerts = lazy(() => import("../pages/PreventiveAlerts"));
const Reminders = lazy(() => import("../pages/Reminders"));
const Monitoring = lazy(() => import("../pages/Monitoring"));
const Settings = lazy(() => import("../pages/Settings"));
const Register = lazy(() => import("../pages/Register"));

function RequireSession() {
  const { session } = useAuth();
  return session.kind === "authenticated"
    ? <Suspense fallback={<PageLoading fullScreen />}><Outlet /></Suspense>
    : <Navigate to="/login" replace />;
}

function AnonymousOnly() {
  const { session } = useAuth();
  return session.kind === "authenticated" ? <Navigate to="/" replace /> : <AuthLayout />;
}

export default function AppRoutes() {
  const { loading } = useAuth();
  const { isLoading: themeLoading } = useTheme();
  if (loading) return <div className="min-h-screen flex items-center justify-center" role="status">Abrindo Ergo…</div>;
  if (themeLoading) return <div className="min-h-screen flex items-center justify-center" role="status">Carregando sua aparência…</div>;
  return (
    <Routes>
      <Route element={<AnonymousOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
      </Route>
      <Route element={<RequireSession />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard/indice-ergonomico" element={<ErgonomicIndex />} />
          <Route path="/dashboard/boa-postura" element={<GoodPosture />} />
          <Route path="/dashboard/alertas-preventivos" element={<PreventiveAlerts />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
