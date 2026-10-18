import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-6 text-slate-900 [color-scheme:light] sm:px-8 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-linear-to-b from-primary-100/60 to-transparent" />
      <div className="relative w-full max-w-5xl">
        <Outlet />
      </div>
    </main>
  );
}
