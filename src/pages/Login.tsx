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
    <section className="auth-content" aria-labelledby="login-title">
      <h1 id="login-title" className="auth-title">Faça login na sua conta para continuar</h1>
      <form className="auth-form" onSubmit={submit} noValidate aria-busy={pending === "login"}>
        <Input label="E-mail" type="email" autoComplete="username" maxLength={254} value={email}
          onChange={(event) => { setEmail(event.target.value); setErrors((previous) => ({ ...previous, email: undefined })); }}
          error={errors.email} disabled={Boolean(pending)} aria-required="true"
          containerClassName="auth-field" labelClassName="auth-label" inputClassName="auth-input" errorClassName="auth-error" />
        <Input label="Senha" type="password" autoComplete="current-password" maxLength={128} value={password}
          onChange={(event) => { setPassword(event.target.value); setErrors((previous) => ({ ...previous, password: undefined })); }}
          error={errors.password} disabled={Boolean(pending)} aria-required="true"
          containerClassName="auth-field" labelClassName="auth-label" inputClassName="auth-input" errorClassName="auth-error" />
        {(feedback || auth.initializationError) && <p role="alert" className="auth-feedback">{feedback || auth.initializationError}</p>}
        <Button type="submit" className="auth-button auth-button--primary" disabled={Boolean(pending)} isLoading={pending === "login"}>
          {pending === "login" ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <div className="auth-divider">Ainda não tem uma conta?</div>
      <Button variant="secondary" className="auth-button auth-button--secondary" disabled={Boolean(pending)} onClick={() => setOnlineDialog(true)}>Cadastrar-se</Button>
      <Button variant="secondary" className="auth-button auth-button--secondary" disabled={Boolean(pending)} isLoading={pending === "guest"} onClick={enterGuest}>Continuar offline</Button>
      <AuthDialog open={onlineDialog} onClose={() => setOnlineDialog(false)} title="Cadastre-se na nossa plataforma on-line."
        actions={<>
          <Button className="auth-button auth-button--primary" onClick={() => { setOnlineDialog(false); navigate("/cadastro"); }}>Cadastrar online</Button>
          <Button variant="secondary" className="auth-button auth-button--secondary" onClick={() => setOnlineDialog(false)}>Voltar</Button>
        </>}>
        <p>Cadastrando-se pela plataforma on-line você terá acesso a:</p>
        <ul>
          <li>Backup de todas as informações coletadas pelo app.</li>
          <li>Dashboard interativo com insights detalhados.</li>
          <li>Permissão para o time de RH acompanhar os resultados da sua saúde no ambiente de trabalho.</li>
        </ul>
        <p className="auth-dialog-note">A plataforma on-line ainda não está disponível. Por enquanto, o cadastro será realizado no próprio app, sem envio de dados.</p>
      </AuthDialog>
      <AuthDialog open={registrationComplete} variant="success" title="Cadastro realizado com sucesso!" onClose={closeSuccess}
        actions={<Button className="auth-button auth-button--primary" onClick={closeSuccess}>Fazer login</Button>}>
        <p>Faça login na sua conta utilizando as credenciais e comece a utilizar o app agora.</p>
      </AuthDialog>
    </section>
  );
}
