import { Outlet } from "react-router-dom";
import "./auth.css";

export default function AuthLayout() {
  return (
    <main className="auth-shell">
      <div className="auth-brand" aria-label="Ergo">Ergo</div>
      <Outlet />
    </main>
  );
}
