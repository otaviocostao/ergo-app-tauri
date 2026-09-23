import { NavLink } from "react-router-dom";
import { Home, Settings, Bell, Video, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { authErrorMessage } from "../auth/authService";

export default function Sidebar() {
  const { session, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const user = session.kind === "authenticated" ? session.user : null;
  async function signOut() {
    setPending(true);
    try { await logout(); }
    catch (error) { setError(authErrorMessage(error)); }
    finally { setPending(false); }
  }
  const navItems = [
    { label: "Início", path: "/", icon: Home },
    { label: "Monitoramento", path: "/monitoring", icon: Video },
    { label: "Lembretes", path: "/reminders", icon: Bell },
    { label: "Configurações", path: "/settings", icon: Settings },
  ];

  return (
    <aside className="w-60 h-screen bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 transition-colors dark:bg-slate-900 dark:border-slate-800">
      <div>
        <div className="h-14 flex items-center px-5 border-b border-slate-200 dark:border-slate-800">
          <span className="text-lg font-bold text-slate-900 tracking-tight dark:text-white">
            Ergo
          </span>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                viewTransition
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                    ? "bg-primary-50 text-primary-700 font-semibold dark:bg-primary-950/60 dark:text-primary-400"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  }`
                }
              >
                <IconComponent className="shrink-0" size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 flex items-center justify-center font-semibold text-xs shrink-0">
            {user?.fullName.charAt(0).toUpperCase() || "V"}
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate" title={user?.fullName}>
              {user?.fullName || "Visitante"}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {user ? "Conta local" : "Modo offline"}
            </span>
          </div>
        </div>
        <button onClick={signOut} disabled={pending} className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50">
          <LogOut size={16} /> {pending ? "Saindo…" : user ? "Sair da conta" : "Voltar ao login"}
        </button>
        {error && <p role="alert" className="text-xs text-red-600 p-2">{error}</p>}
      </div>
    </aside>
  );
}
