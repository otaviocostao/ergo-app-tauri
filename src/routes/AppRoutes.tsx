import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import MainLayout from "../components/MainLayout";
import Home from "../pages/Home";
import Reminders from "../pages/Reminders";
import Monitoring from "../pages/Monitoring";
import Login from "../pages/Login";
import Register from "../pages/Register";
import AuthLayout from "../components/auth/AuthLayout";
import { useAuth } from "../auth/AuthContext";

function RequireSession() {
  const { session } = useAuth();
  return session.kind === "anonymous" ? <Navigate to="/login" replace /> : <Outlet />;
}

function AnonymousOnly() {
  const { session } = useAuth();
  return session.kind === "anonymous" ? <AuthLayout /> : <Navigate to="/" replace />;
}

export default function AppRoutes() {
  const { loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center" role="status">Abrindo Ergo…</div>;
  return (
    <Routes>
      <Route element={<AnonymousOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
      </Route>
      <Route element={<RequireSession />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/settings" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
