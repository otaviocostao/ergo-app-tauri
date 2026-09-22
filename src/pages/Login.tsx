import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import AuthDialog from "../components/auth/AuthDialog";
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
  const [pending, setPending] = useState<"login" | "guest" | null>(null);
  const [onlineDialog, setOnlineDialog] = useState(false);

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
    setPending("login");
    try {
      await auth.login(email, password);
      navigate("/", { replace: true });
    } catch (error) {
      setFeedback(authErrorMessage(error));
      setPassword("");
    } finally { setPending(null); }
  }

  async function enterGuest() {
    if (pending) return;
    setPending("guest");
    setFeedback("");
    try {
      await auth.enterGuest();
      navigate("/", { replace: true });
    } catch (error) { setFeedback(authErrorMessage(error)); }
    finally { setPending(null); }
  }

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-6" aria-labelledby="login-title">
      <h1 id="login-title" className="w-full text-center text-2xl font-semibold leading-9 tracking-tight">Faça login na sua conta para continuar</h1>
      <form className="flex w-full flex-col gap-4" onSubmit={submit} noValidate aria-busy={pending === "login"}>
        <Input label="E-mail" type="email" autoComplete="username" maxLength={254} value={email}
          onChange={(event) => { setEmail(event.target.value); setErrors((previous) => ({ ...previous, email: undefined })); }}
          error={errors.email} disabled={Boolean(pending)} aria-required="true" inputSize="lg"
          containerClassName="gap-4" labelClassName="text-base! font-normal! leading-6 text-black! dark:text-black!"
          inputClassName="h-10 bg-white py-2! text-black select-text dark:border-slate-200! dark:bg-white! dark:text-black! dark:disabled:border-slate-200! dark:disabled:bg-slate-50! dark:disabled:text-slate-400! dark:aria-invalid:border-red-500!" />
        <Input label="Senha" type="password" autoComplete="current-password" maxLength={128} value={password}
          onChange={(event) => { setPassword(event.target.value); setErrors((previous) => ({ ...previous, password: undefined })); }}
          error={errors.password} disabled={Boolean(pending)} aria-required="true" inputSize="lg"
          containerClassName="gap-4" labelClassName="text-base! font-normal! leading-6 text-black! dark:text-black!"
          inputClassName="h-10 bg-white py-2! text-black select-text dark:border-slate-200! dark:bg-white! dark:text-black! dark:disabled:border-slate-200! dark:disabled:bg-slate-50! dark:disabled:text-slate-400! dark:aria-invalid:border-red-500!" />
        {(feedback || auth.initializationError) && (
          <p role="alert" className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-800">
            {feedback || auth.initializationError}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full shadow-none" disabled={Boolean(pending)} isLoading={pending === "login"}>
          {pending === "login" ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <div className="flex w-full items-center gap-2 whitespace-nowrap text-base leading-6 text-slate-500">
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        Ainda não tem uma conta?
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
      </div>
      <Button variant="secondary" size="lg" className="w-full shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" disabled={Boolean(pending)} onClick={() => setOnlineDialog(true)}>Cadastrar-se</Button>
      <Button variant="secondary" size="lg" className="w-full shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" disabled={Boolean(pending)} isLoading={pending === "guest"} onClick={enterGuest}>Continuar offline</Button>
      <AuthDialog open={onlineDialog} onClose={() => setOnlineDialog(false)} title="Cadastre-se na nossa plataforma on-line."
        actions={<>
          <Button size="lg" className="w-full shadow-none" onClick={() => { setOnlineDialog(false); navigate("/cadastro"); }}>Cadastrar online</Button>
          <Button variant="secondary" size="lg" className="w-full shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" onClick={() => setOnlineDialog(false)}>Voltar</Button>
        </>}>
        <p>Cadastrando-se pela plataforma on-line você terá acesso a:</p>
        <ul className="list-disc pl-6">
          <li>Backup de todas as informações coletadas pelo app.</li>
          <li>Dashboard interativo com insights detalhados.</li>
          <li>Permissão para o time de RH acompanhar os resultados da sua saúde no ambiente de trabalho.</li>
        </ul>
        <p className="mt-4 text-slate-600">A plataforma on-line ainda não está disponível. Por enquanto, o cadastro será realizado no próprio app, sem envio de dados.</p>
      </AuthDialog>
      <AuthDialog open={registrationComplete} variant="success" title="Cadastro realizado com sucesso!" onClose={closeSuccess}
        actions={<Button size="lg" className="w-full shadow-none" onClick={closeSuccess}>Fazer login</Button>}>
        <p>Faça login na sua conta utilizando as credenciais e comece a utilizar o app agora.</p>
      </AuthDialog>
    </section>
  );
}
