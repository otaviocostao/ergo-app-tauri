import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import ThemeFeedback from "../theme/ThemeFeedback";
import MonitoringWorkspace from "./monitoring/MonitoringWorkspace";
import { useAuth } from "../auth/AuthContext";

export default function MainLayout() {
  const { session } = useAuth();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-col flex-1 h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <ThemeFeedback />
          <MonitoringWorkspace key={session.kind === "authenticated" ? session.user.id : session.kind} />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
