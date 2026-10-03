import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { authErrorMessage, authService, type Registration } from "../auth/authService";

type Fields = Pick<Registration, "firstName" | "lastName" | "birthDate" | "email" | "phone" | "password"> & {
  confirmation: string;
};
type Errors = Partial<Record<keyof Fields, string>>;

const initialFields: Fields = {
  firstName: "",
  lastName: "",
  birthDate: "",
  email: "",
  phone: "",
  password: "",
  confirmation: "",
};

export default function Register() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<Fields>(initialFields);
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

    if (fields.firstName.trim().length < 2) validation.firstName = "Informe seu nome.";
    if (fields.lastName.trim().length < 2) validation.lastName = "Informe seu sobrenome.";
    if (!fields.birthDate) {
      validation.birthDate = "Informe sua data de nascimento.";
    } else if (fields.birthDate > new Date().toISOString().split("T")[0]) {
      validation.birthDate = "A data de nascimento não pode estar no futuro.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) validation.email = "Informe um e-mail válido.";
    const phoneDigits = fields.phone.replace(/\D/g, "");
    if (phoneDigits.length < 8 || phoneDigits.length > 15) validation.phone = "Informe um telefone válido.";
    if (Array.from(fields.password).length < 8) validation.password = "A senha deve ter no mínimo 8 caracteres.";
    if (Array.from(fields.password).length > 128) validation.password = "A senha excede o limite de caracteres.";
    if (!fields.confirmation || fields.confirmation !== fields.password) validation.confirmation = "As senhas devem ser iguais.";

    const validationMessages = Object.values(validation).filter(Boolean) as string[];

    if (validationMessages.length > 0) {
      setFeedback(validationMessages.join("\n"));
      return;
    }

    setFeedback("");
    setPending(true);
    try {
      await authService.register({
        firstName: fields.firstName,
        lastName: fields.lastName,
        birthDate: fields.birthDate,
        email: fields.email,
        phone: fields.phone,
        password: fields.password,
      });
      setFields(initialFields);
      navigate("/login", { replace: true, state: { registrationComplete: true }, viewTransition: true });
    } catch (error) { setFeedback(authErrorMessage(error)); }
    finally { setPending(false); }
  }

  const inputs: Array<{
    field: keyof Fields;
    label: string;
    type: string;
    autoComplete: string;
    maxLength?: number;
    max?: string;
  }> = [
    { field: "firstName", label: "Nome", type: "text", autoComplete: "given-name", maxLength: 60 },
    { field: "lastName", label: "Sobrenome", type: "text", autoComplete: "family-name", maxLength: 60 },
    { field: "birthDate", label: "Data de nascimento", type: "date", autoComplete: "bday", max: new Date().toISOString().split("T")[0] },
    { field: "email", label: "E-mail", type: "email", autoComplete: "username", maxLength: 254 },
    { field: "phone", label: "Telefone", type: "tel", autoComplete: "tel", maxLength: 30 },
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
          <p role="alert" className="w-full whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-800">{feedback}</p>
        )}
        <Button type="submit" size="lg" className="w-full shadow-none" isLoading={pending}>{pending ? "Cadastrando…" : "Cadastrar"}</Button>
      </form>
      <Button variant="secondary" size="lg" className="w-full shadow-none dark:bg-slate-100! dark:text-slate-700! dark:hover:bg-slate-200! dark:active:bg-slate-300!" disabled={pending} onClick={() => navigate("/login", { viewTransition: true })}>Voltar</Button>
    </section>
  );
}
