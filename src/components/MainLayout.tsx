import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import ThemeFeedback from "../theme/ThemeFeedback";
import PageLoading from "./PageLoading";

export default function MainLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-col flex-1 h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <ThemeFeedback />
          <Suspense key={pathname} fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
