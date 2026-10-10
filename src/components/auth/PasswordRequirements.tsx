import { CheckCircle2, Circle } from "lucide-react";
import { passwordRequirements } from "../../auth/passwordPolicy";

export default function PasswordRequirements({ password }: { password: string }) {
  return (
    <div id="register-password-requirements" className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <p className="mb-2 text-xs font-medium text-slate-600">Sua senha deve conter:</p>
      <ul className="space-y-1.5">
        {passwordRequirements.map(({ id, label, test }) => {
          const satisfied = test(password);
          const Icon = satisfied ? CheckCircle2 : Circle;
          return (
            <li key={id} className={`flex items-center gap-2 text-xs leading-5 transition-colors ${satisfied ? "text-primary-700" : "text-slate-500"}`}>
              <Icon size={14} className="shrink-0" aria-hidden="true" />
              <span className="sr-only">{satisfied ? "Atendido: " : "Pendente: "}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
