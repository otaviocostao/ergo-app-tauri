export const MIN_USER_AGE = 14;
export const MAX_USER_AGE = 100;

export function dateValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseBirthDate(value: string): Date | undefined {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!iso && !local) return undefined;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(local![3]), Number(local![2]), Number(local![1])];
  if (year < 1) return undefined;
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

export function displayBirthDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
}

export function birthDateBounds(today = new Date()) {
  function yearsAgo(years: number) {
    const date = new Date(today);
    const month = date.getMonth();
    date.setFullYear(date.getFullYear() - years);
    if (date.getMonth() !== month) date.setDate(0);
    return date;
  }
  const earliest = yearsAgo(MAX_USER_AGE + 1);
  earliest.setDate(earliest.getDate() + 1);
  return { earliest, latest: yearsAgo(MIN_USER_AGE) };
}

export function birthDateValidationMessage(value: string, today = new Date()): string | undefined {
  if (!value.trim()) return undefined;
  const date = parseBirthDate(value);
  if (!date) return "Informe uma data de nascimento válida no formato DD/MM/AAAA.";
  const iso = dateValue(date);
  if (iso > dateValue(today)) return "A data de nascimento não pode estar no futuro.";
  const { earliest, latest } = birthDateBounds(today);
  if (iso < dateValue(earliest)) return `A data de nascimento não pode indicar mais de ${MAX_USER_AGE} anos.`;
  if (iso > dateValue(latest)) return `A data de nascimento deve indicar pelo menos ${MIN_USER_AGE} anos.`;
  return undefined;
}
