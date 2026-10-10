import type { ReactNode } from "react";
import { Bell, BellRing, Monitor, ScanEye, SlidersHorizontal, UserRound } from "lucide-react";

interface AuthCardProps {
  titleId: string;
  children: ReactNode;
  contentClassName?: string;
}

const benefits = [
  { icon: UserRound, text: "Acompanhe sua postura" },
  { icon: Bell, text: "Crie lembretes do seu jeito" },
  { icon: BellRing, text: "Conte com alertas ergonômicos do sistema" },
  { icon: SlidersHorizontal, text: "Personalize seu ambiente de trabalho" },
];

export default function AuthCard({ titleId, children, contentClassName = "" }: AuthCardProps) {
  return (
    <section className="grid w-full rounded-3xl border border-slate-200/80 bg-white shadow-[0_16px_64px_-24px_rgba(3,45,38,0.22)] md:grid-cols-[0.85fr_1.4fr]" aria-labelledby={titleId}>
      <aside className="relative flex flex-col justify-between overflow-hidden rounded-t-3xl bg-primary-800 p-6 text-white md:rounded-l-3xl md:rounded-tr-none md:p-8 lg:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-28 size-80 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
            <ScanEye size={22} className="text-primary-200" aria-hidden="true" />
          </span>
          <span className="text-2xl font-semibold tracking-tight">Ergo</span>
        </div>
        <div className="relative mt-5 md:my-8">
          <span className="hidden text-xs font-medium tracking-[0.16em] text-primary-200 uppercase md:inline">Bem-estar no trabalho</span>
          <h2 className="max-w-xs text-xl font-semibold leading-tight tracking-tight md:mt-4 md:text-3xl lg:text-4xl">Cuide de você, uma pausa de cada vez.</h2>
          <p className="mt-4 hidden max-w-xs text-sm leading-6 text-primary-100/90 md:block">Uma rotina mais equilibrada começa com pequenos cuidados. O Ergo acompanha você nesse caminho.</p>
          <ul className="mt-8 hidden space-y-4 md:block">
            {benefits.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm leading-5 text-primary-50">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10"><Icon size={16} aria-hidden="true" /></span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-5 flex items-start gap-2.5 border-t border-white/15 pt-4 text-xs leading-5 text-primary-100 md:mt-6 md:pt-5">
          <Monitor size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>Conta local. Seus dados ficam neste dispositivo.</p>
        </div>
      </aside>
      <div className={`min-w-0 px-6 py-7 sm:px-8 sm:py-8 lg:px-10 ${contentClassName}`}>
        {children}
      </div>
    </section>
  );
}
