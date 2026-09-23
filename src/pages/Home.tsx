import { Link } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../auth/AuthContext";

export default function Home() {
  const { session } = useAuth();
  const name = session.kind === "authenticated" ? session.user.fullName.split(" ")[0] : null;
  return (
    <div className="w-full h-full flex flex-col gap-4">
      <Header title={name ? `Olá, ${name}!` : "Bem-vindo ao Ergo"} subtitle="Cuide do seu bem-estar durante o trabalho." />
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{name ? "Sua conta está neste computador" : "Você está no modo visitante"}</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{name ? "Você entrou com sua conta local. Não há sincronização com outros computadores." : "Explore o app sem criar uma conta. Use “Voltar ao login” no menu para entrar ou se cadastrar."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/monitoring" viewTransition className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600">Abrir monitoramento</Link>
        <Link to="/reminders" viewTransition className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200">Ver lembretes</Link>
      </div>
    </div>
  );
}
