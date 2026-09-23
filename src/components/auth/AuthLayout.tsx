import { Outlet, useLocation } from "react-router-dom";

export default function AuthLayout() {
  const location = useLocation();

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-white px-6 pb-6 pt-24 text-black [color-scheme:light]">
      <div
        className="absolute left-1/2 top-6 -translate-x-1/2 text-3xl font-semibold leading-12 tracking-tight"
        aria-label="Ergo"
      >
        Ergo
      </div>
      <div key={location.pathname} className="flex w-full justify-center motion-safe:animate-page-enter">
        <Outlet />
      </div>
    </main>
  );
}
