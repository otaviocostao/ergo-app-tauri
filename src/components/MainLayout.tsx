import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar, { TopbarMonitoringProvider } from "./Topbar";
import ThemeFeedback from "../theme/ThemeFeedback";
import MonitoringWorkspace from "./monitoring/MonitoringWorkspace";
import { useAuth } from "../auth/AuthContext";

export default function MainLayout() {
  const { session } = useAuth();
  const sessionKey = session.kind === "authenticated" ? session.user.id : session.kind;

  return (
    <TopbarMonitoringProvider key={sessionKey}>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        <Sidebar />
        <div className="flex min-w-0 flex-col flex-1 h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6" style={{ scrollbarGutter: "stable" }}>
            <ThemeFeedback />
            <MonitoringWorkspace />
            <Outlet />
          </main>
        </div>
      </div>
    </TopbarMonitoringProvider>
  );
}
