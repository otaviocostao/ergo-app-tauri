import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import Button from "../components/Button";
import Input from "../components/Input";
import Toastr from "../components/Toastr";
import BirthDateInput from "../components/auth/BirthDateInput";
import AuthCard from "../components/auth/AuthCard";
import PasswordRequirements from "../components/auth/PasswordRequirements";
import PhoneInput from "../components/auth/PhoneInput";
import { authFieldStyles, authPrimaryButtonClass } from "../components/auth/authStyles";
import { authErrorMessage, authService, type Registration } from "../auth/authService";
import { PASSWORD_MAX_LENGTH, passwordValidationMessage } from "../auth/passwordPolicy";
import { birthDateValidationMessage, dateValue, parseBirthDate } from "../auth/birthDatePolicy";

type Fields = Required<Pick<Registration, "firstName" | "lastName" | "birthDate" | "email" | "phone" | "password">> & {
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
  const [toastError, setToastError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(field: keyof Fields, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined, ...(field === "password" ? { confirmation: undefined } : {}) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const validation: Errors = {};

    if (fields.firstName.trim().length < 2) validation.firstName = "Informe seu nome.";
    if (fields.lastName.trim().length < 2) validation.lastName = "Informe seu sobrenome.";
    validation.birthDate = birthDateValidationMessage(fields.birthDate);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) validation.email = "Informe um e-mail válido.";
    const phoneDigits = fields.phone.replace(/\D/g, "");
    if (fields.phone.trim() && phoneDigits.length !== 11) validation.phone = "Informe o telefone com DDD e 9 dígitos.";
    validation.password = passwordValidationMessage(fields.password);
    if (!fields.confirmation || fields.confirmation !== fields.password) validation.confirmation = "As senhas devem ser iguais.";

    const validationMessages = Object.values(validation).filter(Boolean) as string[];

    setErrors(validation);
    if (validationMessages.length > 0) return;

    setPending(true);
    try {
      await authService.register({
        firstName: fields.firstName,
        lastName: fields.lastName,
        birthDate: fields.birthDate.trim() ? dateValue(parseBirthDate(fields.birthDate)!) : "",
        email: fields.email,
        phone: fields.phone,
        password: fields.password,
      });
      setFields(initialFields);
      navigate("/login", { replace: true, state: { registrationComplete: true }, viewTransition: true });
    } catch (error) {
      setToastError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
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
      { field: "phone", label: "Telefone (opcional)", type: "tel", placeholder: "Ex.: (99) 99999-9999", autoComplete: "tel", maxLength: 15 },
      { field: "password", label: "Senha", type: "password", placeholder: "Crie sua senha", autoComplete: "new-password", maxLength: PASSWORD_MAX_LENGTH },
      { field: "confirmation", label: "Confirmar senha", type: "password", placeholder: "Repita sua senha", autoComplete: "new-password", maxLength: PASSWORD_MAX_LENGTH },
    ];

  function renderInput({ field, ...input }: typeof inputs[number]) {
    return field === "birthDate" ? (
      <div key={field} className="sm:col-span-2">
        <BirthDateInput value={fields.birthDate} onChange={(value) => update("birthDate", value)}
          error={errors.birthDate} disabled={pending} />
      </div>
    ) : field === "phone" ? (
      <PhoneInput key={field} id="register-phone" name="phone" label={input.label} placeholder={input.placeholder}
        autoComplete={input.autoComplete} value={fields.phone} onChange={(value) => update("phone", value)}
        error={errors.phone} disabled={pending} {...authFieldStyles} />
    ) : (
      <div key={field} className={`min-w-0${field === "confirmation" ? " sm:col-start-1 sm:row-start-2" : ""}`}>
        <Input id={`register-${field}`} name={field} {...input} value={fields[field]} onChange={(event) => update(field, event.target.value)}
          {...(field === "password" ? { "aria-describedby": `register-password-requirements${errors.password ? " register-password-error" : ""}` } : {})}
          error={errors[field]} disabled={pending} aria-required="true" {...authFieldStyles} />
      </div>
    );
  }

  return (
    <>
      <Toastr
        isOpen={Boolean(toastError)}
        type="error"
        title="Erro no cadastro"
        message={toastError ?? ""}
        onClose={() => setToastError(null)}
      />
      <AuthCard titleId="register-title">
        <button type="button" disabled={pending} onClick={() => navigate("/login", { viewTransition: true })}
          className="mb-6 inline-flex cursor-pointer items-center gap-1.5 rounded-md text-xs font-medium text-slate-500 transition-colors hover:text-primary-700 dark:text-slate-400 dark:hover:text-primary-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600 disabled:cursor-default disabled:opacity-50">
          <ArrowLeft size={14} aria-hidden="true" /> Voltar ao login
        </button>
        <header className="mb-6">
          <h1 id="register-title" className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Crie sua conta</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Preencha seus dados para começar a usar o Ergo.</p>
        </header>
        <form className="flex flex-col gap-6" onSubmit={submit} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="min-w-0">
            <legend className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <UserRound size={16} className="text-primary-700 dark:text-primary-400" aria-hidden="true" /> Informações pessoais
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{inputs.slice(0, 5).map(renderInput)}</div>
          </fieldset>
          <fieldset disabled={pending} className="min-w-0 border-t border-slate-100 pt-5 dark:border-slate-800">
            <legend className="flex items-center gap-2 bg-white pr-3 text-sm font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <LockKeyhole size={16} className="text-primary-700 dark:text-primary-400" aria-hidden="true" /> Seu acesso
            </legend>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              {renderInput(inputs[5])}
              <div className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
                <PasswordRequirements password={fields.password} />
              </div>
              {renderInput(inputs[6])}
            </div>
          </fieldset>
          <div>
            <Button type="submit" size="lg" className={`h-12 ${authPrimaryButtonClass}`} isLoading={pending}>
              {pending ? "Criando sua conta…" : "Criar conta"}
              {!pending && <ArrowRight size={18} aria-hidden="true" />}
            </Button>
          </div>
        </form>
      </AuthCard>
    </>
  );
}
