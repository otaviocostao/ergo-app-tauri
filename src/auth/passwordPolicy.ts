export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 70;

export const passwordRequirements = [
  {
    id: "length",
    label: "De 8 a 70 caracteres",
    test: (password: string) => {
      const length = Array.from(password).length;
      return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
    },
  },
  { id: "lowercase", label: "Uma letra minúscula", test: (password: string) => /\p{Lowercase}/u.test(password) },
  { id: "uppercase", label: "Uma letra maiúscula", test: (password: string) => /\p{Uppercase}/u.test(password) },
  { id: "number", label: "Um número", test: (password: string) => /[0-9]/.test(password) },
  {
    id: "symbol",
    label: "Um símbolo (ex.: !, @ ou #)",
    test: (password: string) => /[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/.test(password),
  },
];

export function passwordValidationMessage(password: string): string | undefined {
  if (!passwordRequirements[0].test(password)) {
    return "A senha deve ter entre 8 e 70 caracteres.";
  }
  if (passwordRequirements.some((requirement) => !requirement.test(password))) {
    return "Inclua uma letra maiúscula, uma minúscula, um número e um símbolo na senha.";
  }
  return undefined;
}
