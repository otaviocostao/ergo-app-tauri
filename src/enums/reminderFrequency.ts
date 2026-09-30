export enum ReminderFrequency {
  ONCE = "ONCE",
  DAILY = "DAILY",
  BUSINESS_DAYS = "BUSINESS_DAYS",
  WEEKENDS = "WEEKENDS",
  CUSTOM = "CUSTOM",
}

export const REMINDER_FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  [ReminderFrequency.ONCE]: "Não repetir",
  [ReminderFrequency.DAILY]: "Diariamente",
  [ReminderFrequency.BUSINESS_DAYS]: "Dias Úteis",
  [ReminderFrequency.WEEKENDS]: "Finais de Semana",
  [ReminderFrequency.CUSTOM]: "Personalizado",
};

export const REMINDER_FREQUENCY_OPTIONS = [
  { label: "Não repetir", value: ReminderFrequency.ONCE },
  { label: "Diariamente", value: ReminderFrequency.DAILY },
  { label: "Dias Úteis", value: ReminderFrequency.BUSINESS_DAYS },
  { label: "Finais de Semana", value: ReminderFrequency.WEEKENDS },
  { label: "Personalizado", value: ReminderFrequency.CUSTOM },
];
