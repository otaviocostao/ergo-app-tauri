import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import Button from "../components/Button";
import Input from "../components/Input";
import BirthDateInput from "../components/auth/BirthDateInput";
import AuthCard from "../components/auth/AuthCard";
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
  const today = new Date();
  const maxBirthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

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
    } else if (fields.birthDate > maxBirthDate) {
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
    placeholder?: string;
    helperText?: string;
    maxLength?: number;
  }> = [
    { field: "firstName", label: "Nome", type: "text", placeholder: "Digite seu nome", autoComplete: "given-name", maxLength: 60 },
    { field: "lastName", label: "Sobrenome", type: "text", placeholder: "Digite seu sobrenome", autoComplete: "family-name", maxLength: 60 },
    { field: "birthDate", label: "Data de nascimento", type: "date", autoComplete: "bday" },
    { field: "email", label: "E-mail", type: "email", placeholder: "Ex.: nome@email.com", autoComplete: "username", maxLength: 254 },
    { field: "phone", label: "Telefone", type: "tel", placeholder: "Ex.: (99) 99999-9999", autoComplete: "tel", maxLength: 30 },
    { field: "password", label: "Senha", type: "password", placeholder: "Crie sua senha", helperText: "Use entre 8 e 128 caracteres.", autoComplete: "new-password", maxLength: 128 },
    { field: "confirmation", label: "Confirmar senha", type: "password", placeholder: "Repita sua senha", autoComplete: "new-password", maxLength: 128 },
  ];

  function renderInput({ field, ...input }: typeof inputs[number]) {
    return field === "birthDate" ? (
      <div key={field} className="sm:col-span-2">
        <BirthDateInput value={fields.birthDate} onChange={(value) => update("birthDate", value)}
          error={errors.birthDate} disabled={pending} />
      </div>
    ) : (
      <Input key={field} {...input} value={fields[field]} onChange={(event) => update(field, event.target.value)}
        error={errors[field]} disabled={pending} aria-required="true"
        inputSize="md" containerClassName="gap-2" helperClassName="text-xs dark:text-slate-500!"
        labelClassName="text-sm! font-medium! text-slate-700! dark:text-slate-700!"
        inputClassName="h-11 bg-slate-50/80 text-slate-900 select-text placeholder:text-slate-400 focus:bg-white dark:border-slate-200! dark:bg-slate-50! dark:text-slate-900! dark:placeholder:text-slate-400! dark:disabled:border-slate-200! dark:disabled:bg-slate-100! dark:disabled:text-slate-400! dark:aria-invalid:border-red-500!" />
    );
  }

  return (
    <AuthCard titleId="register-title">
        <button type="button" disabled={pending} onClick={() => navigate("/login", { viewTransition: true })}
          className="mb-6 inline-flex cursor-pointer items-center gap-1.5 rounded-md text-xs font-medium text-slate-500 transition-colors hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600 disabled:cursor-default disabled:opacity-50">
          <ArrowLeft size={14} aria-hidden="true" /> Voltar ao login
        </button>
        <header className="mb-6">
          <h1 id="register-title" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Crie sua conta</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Preencha seus dados para começar a usar o Ergo.</p>
        </header>
        <form className="flex flex-col gap-6" onSubmit={submit} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="min-w-0">
            <legend className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <UserRound size={16} className="text-primary-700" aria-hidden="true" /> Informações pessoais
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{inputs.slice(0, 5).map(renderInput)}</div>
          </fieldset>
          <fieldset disabled={pending} className="min-w-0 border-t border-slate-100 pt-5">
            <legend className="flex items-center gap-2 bg-white pr-3 text-sm font-semibold text-slate-800">
              <LockKeyhole size={16} className="text-primary-700" aria-hidden="true" /> Seu acesso
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{inputs.slice(5).map(renderInput)}</div>
          </fieldset>
          {feedback && (
            <p role="alert" className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-800">{feedback}</p>
          )}
          <div>
            <Button type="submit" size="lg" className="h-12 w-full rounded-xl! bg-primary-700! text-sm! shadow-none hover:bg-primary-800! dark:bg-primary-700! dark:hover:bg-primary-800!" isLoading={pending}>
              {pending ? "Criando sua conta…" : "Criar conta"}
              {!pending && <ArrowRight size={18} aria-hidden="true" />}
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">Todos os campos são obrigatórios.</p>
          </div>
        </form>
    </AuthCard>
  );
}
