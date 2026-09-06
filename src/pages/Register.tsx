import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { authErrorMessage, authService, type Registration } from "../auth/authService";

type Fields = Registration & { confirmation: string };
type Errors = Partial<Record<keyof Fields, string>>;

export default function Register() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<Fields>({ fullName: "", email: "", password: "", confirmation: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  function update(field: keyof Fields, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setFeedback("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const validation: Errors = {};
    if (fields.fullName.trim().length < 2) validation.fullName = "Informe seu nome completo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) validation.email = "Informe um e-mail válido.";
    if (Array.from(fields.password).length < 8 || Array.from(fields.password).length > 128) validation.password = "A senha deve ter entre 8 e 128 caracteres.";
    if (!fields.confirmation || fields.confirmation !== fields.password) validation.confirmation = "As senhas devem ser iguais.";
    setErrors(validation);
    setFeedback("");
    if (Object.keys(validation).length) return;
    setPending(true);
    try {
      await authService.register({ fullName: fields.fullName, email: fields.email, password: fields.password });
      setFields({ fullName: "", email: "", password: "", confirmation: "" });
      navigate("/login", { replace: true, state: { registrationComplete: true } });
    } catch (error) { setFeedback(authErrorMessage(error)); }
    finally { setPending(false); }
  }

  const inputs: { field: keyof Fields; label: string; type: string; autoComplete: string; maxLength: number }[] = [
    { field: "fullName", label: "Nome completo", type: "text", autoComplete: "name", maxLength: 120 },
    { field: "email", label: "E-mail", type: "email", autoComplete: "username", maxLength: 254 },
    { field: "password", label: "Senha", type: "password", autoComplete: "new-password", maxLength: 128 },
    { field: "confirmation", label: "Confirmar senha", type: "password", autoComplete: "new-password", maxLength: 128 },
  ];

  return (
    <section className="auth-content" aria-labelledby="register-title">
      <h1 id="register-title" className="auth-title">Cadastre-se de maneira off-line</h1>
      <form className="auth-form" onSubmit={submit} noValidate aria-busy={pending}>
        {inputs.map(({ field, ...input }) => (
          <Input key={field} {...input} value={fields[field]} onChange={(event) => update(field, event.target.value)}
            error={errors[field]} disabled={pending} aria-required="true" title={field === "password" ? "Use entre 8 e 128 caracteres." : undefined}
            containerClassName="auth-field" labelClassName="auth-label" inputClassName="auth-input" errorClassName="auth-error" />
        ))}
        {feedback && <p role="alert" className="auth-feedback">{feedback}</p>}
        <Button type="submit" className="auth-button auth-button--primary" isLoading={pending}>{pending ? "Cadastrando…" : "Cadastrar"}</Button>
      </form>
      <Button variant="secondary" className="auth-button auth-button--secondary" disabled={pending} onClick={() => navigate("/login")}>Voltar</Button>
    </section>
  );
}
