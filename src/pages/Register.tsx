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
    <section className="flex w-full max-w-md flex-col items-center gap-6" aria-labelledby="register-title">
      <h1 id="register-title" className="w-full text-center text-2xl font-semibold leading-9 tracking-tight">Cadastre-se de maneira off-line</h1>
      <form className="flex w-full flex-col gap-4" onSubmit={submit} noValidate aria-busy={pending}>
        {inputs.map(({ field, ...input }) => (
          <Input key={field} {...input} value={fields[field]} onChange={(event) => update(field, event.target.value)}
            error={errors[field]} disabled={pending} aria-required="true" title={field === "password" ? "Use entre 8 e 128 caracteres." : undefined}
            inputSize="lg" containerClassName="gap-4" labelClassName="text-base! font-normal! leading-6 text-black! dark:text-black!"
            inputClassName="h-10 bg-white py-2! text-black select-text dark:border-slate-200! dark:bg-white! dark:text-black! dark:disabled:border-slate-200! dark:disabled:bg-slate-50! dark:disabled:text-slate-400! dark:aria-invalid:border-red-500!" />
        ))}
        {feedback && (
          <p role="alert" className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-800">{feedback}</p>
        )}
        <Button type="submit" size="lg" className="w-full shadow-none" isLoading={pending}>{pending ? "Cadastrando…" : "Cadastrar"}</Button>
      </form>
      <Button variant="secondary" size="lg" className="w-full shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" disabled={pending} onClick={() => navigate("/login")}>Voltar</Button>
    </section>
  );
}
