import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function MainLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <div className="flex flex-col flex-1 h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <div key={location.pathname} className="min-h-full motion-safe:animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
