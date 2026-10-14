import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, UserPlus, UserRound } from "lucide-react";
import Button from "../components/Button";
import Input from "../components/Input";
import AuthDialog from "../components/auth/AuthDialog";
import AuthCard from "../components/auth/AuthCard";
import VerifiedAnimation from "../components/auth/VerifiedAnimation";
import { useAuth } from "../auth/AuthContext";
import { authErrorMessage } from "../auth/authService";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const registrationComplete = location.state?.registrationComplete === true;
  const closeSuccess = () => navigate("/login", { replace: true, state: null });
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [registrationDialog, setRegistrationDialog] = useState<"options" | "online" | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : "Informe um e-mail válido.",
      password: password ? undefined : "Informe sua senha.",
    };
    setErrors(fields);
    setFeedback("");
    if (fields.email || fields.password) return;
    setPending(true);
    try {
      await auth.login(email, password);
      navigate("/", { replace: true, viewTransition: true });
    } catch (error) {
      setFeedback(authErrorMessage(error));
      setPassword("");
    } finally { setPending(false); }
  }

  return (
    <>
      <AuthCard titleId="login-title" contentClassName="flex flex-col justify-center">
        <header className="mb-7">
          <h1 id="login-title" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Bem-vindo de volta</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Entre com seu e-mail e senha para continuar.</p>
        </header>
      <form className="flex w-full flex-col gap-5" onSubmit={submit} noValidate aria-busy={pending}>
        <Input label="E-mail" type="email" placeholder="Ex.: nome@email.com" autoComplete="username" maxLength={254} value={email}
          onChange={(event) => { setEmail(event.target.value); setErrors((previous) => ({ ...previous, email: undefined })); }}
          error={errors.email} disabled={pending} aria-required="true" inputSize="md"
          containerClassName="gap-2" labelClassName="text-sm! font-medium! text-slate-700! dark:text-slate-700!"
          inputClassName="h-11 bg-slate-50/80 text-slate-900 select-text placeholder:text-slate-400 focus:bg-white dark:border-slate-200! dark:bg-slate-50! dark:text-slate-900! dark:placeholder:text-slate-400! dark:disabled:border-slate-200! dark:disabled:bg-slate-100! dark:disabled:text-slate-400! dark:aria-invalid:border-red-500!" />
        <Input label="Senha" type="password" placeholder="Digite sua senha" autoComplete="current-password" maxLength={128} value={password}
          onChange={(event) => { setPassword(event.target.value); setErrors((previous) => ({ ...previous, password: undefined })); }}
          error={errors.password} disabled={pending} aria-required="true" inputSize="md"
          containerClassName="gap-2" labelClassName="text-sm! font-medium! text-slate-700! dark:text-slate-700!"
          inputClassName="h-11 bg-slate-50/80 text-slate-900 select-text placeholder:text-slate-400 focus:bg-white dark:border-slate-200! dark:bg-slate-50! dark:text-slate-900! dark:placeholder:text-slate-400! dark:disabled:border-slate-200! dark:disabled:bg-slate-100! dark:disabled:text-slate-400! dark:aria-invalid:border-red-500!" />
        {(feedback || auth.initializationError) && (
          <p role="alert" className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-800">
            {feedback || auth.initializationError}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-1 h-12 w-full rounded-xl! bg-primary-700! text-sm! shadow-none hover:bg-primary-800! dark:bg-primary-700! dark:hover:bg-primary-800!" disabled={pending} isLoading={pending}>
          {pending ? "Entrando…" : "Entrar"}
          {!pending && <ArrowRight size={18} aria-hidden="true" />}
        </Button>
      </form>
      <div className="my-6 flex w-full items-center gap-3 text-xs leading-5 text-slate-400">
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        <span className="shrink-0">Ainda não tem uma conta?</span>
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
      </div>
      <Button variant="secondary" size="lg" className="h-12 w-full rounded-xl! border border-primary-100 bg-primary-50! text-sm! text-primary-800! shadow-none hover:bg-primary-100! dark:bg-primary-50! dark:text-primary-800! dark:hover:bg-primary-100!" disabled={pending} onClick={() => setRegistrationDialog("options")}>
        <UserPlus size={18} aria-hidden="true" /> Cadastre-se
      </Button>
      </AuthCard>
      <AuthDialog
        open={registrationDialog === "options"}
        onClose={() => setRegistrationDialog(null)}
        title="Como deseja se cadastrar?"
        actions={
          <Button variant="secondary" size="lg" className="h-11 w-full rounded-xl! text-sm! shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" onClick={() => setRegistrationDialog(null)}>
            Voltar
          </Button>
        }
      >
        <div className="mt-5 flex flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-xl border border-primary-100 bg-primary-50/60 p-5">
            <div className="flex items-start gap-3">
              <Building2 size={20} className="mt-0.5 shrink-0 text-primary-700" aria-hidden="true" />
              <div><h3 className="font-semibold text-slate-800">Para empresas</h3><p className="mt-1 text-sm leading-5 text-slate-600">Conheça a opção de cadastro pela plataforma on-line.</p></div>
            </div>
            <Button size="lg" className="h-11 w-full rounded-xl! bg-primary-700! text-sm! shadow-none hover:bg-primary-800! dark:bg-primary-700! dark:hover:bg-primary-800!" onClick={() => setRegistrationDialog("online")}>
              Cadastrar online
            </Button>
          </section>
          <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <UserRound size={20} className="mt-0.5 shrink-0 text-primary-700" aria-hidden="true" />
              <div><h3 className="font-semibold text-slate-800">Para você</h3><p className="mt-1 text-sm leading-5 text-slate-600">Crie sua conta local e comece a usar o Ergo neste dispositivo.</p></div>
            </div>
            <Button variant="secondary" size="lg" className="h-11 w-full rounded-xl! text-sm! shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" onClick={() => { setRegistrationDialog(null); navigate("/cadastro", { viewTransition: true }); }}>
              Cadastrar offline
            </Button>
          </section>
        </div>
      </AuthDialog>
      <AuthDialog
        open={registrationDialog === "online"}
        onClose={() => setRegistrationDialog(null)}
        title="Cadastro on-line"
        actions={
          <Button variant="secondary" size="lg" className="h-11 w-full rounded-xl! text-sm! shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" onClick={() => setRegistrationDialog("options")}>
            Voltar
          </Button>
        }
      >
        <p>Cadastrando-se pela plataforma on-line você terá acesso a:</p>
        <ul className="list-disc pl-6">
          <li>Backup de todas as informações coletadas pelo app.</li>
          <li>Dashboard interativo com insights detalhados.</li>
          <li>Permissão para o time de RH acompanhar os resultados da sua saúde no ambiente de trabalho.</li>
        </ul>
        <p className="mt-4 text-slate-600">A plataforma on-line ainda não está disponível. Por enquanto, o cadastro será realizado no próprio app, sem envio de dados.</p>
      </AuthDialog>
      <AuthDialog
        open={registrationComplete}
        variant="success"
        title="Cadastro realizado com sucesso!"
        onClose={closeSuccess}
        illustration={<VerifiedAnimation active={registrationComplete} />}
        actions={<Button size="lg" className="h-12 w-full rounded-xl! bg-primary-700! text-sm! shadow-none hover:bg-primary-800! dark:bg-primary-700! dark:hover:bg-primary-800!" onClick={closeSuccess}>Fazer login</Button>}
      >
        <p className="text-center">Faça login na sua conta utilizando as credenciais e comece a utilizar o app agora.</p>
      </AuthDialog>
    </>
  );
}
