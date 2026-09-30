export enum WeekDay {
  SUN = "SUN",
  MON = "MON",
  TUE = "TUE",
  WED = "WED",
  THU = "THU",
  FRI = "FRI",
  SAT = "SAT",
}

export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  [WeekDay.SUN]: "Dom",
  [WeekDay.MON]: "Seg",
  [WeekDay.TUE]: "Ter",
  [WeekDay.WED]: "Qua",
  [WeekDay.THU]: "Qui",
  [WeekDay.FRI]: "Sex",
  [WeekDay.SAT]: "Sáb",
};

export const WEEK_DAYS_OPTIONS = [
  { id: WeekDay.SUN, label: "Dom" },
  { id: WeekDay.MON, label: "Seg" },
  { id: WeekDay.TUE, label: "Ter" },
  { id: WeekDay.WED, label: "Qua" },
  { id: WeekDay.THU, label: "Qui" },
  { id: WeekDay.FRI, label: "Sex" },
  { id: WeekDay.SAT, label: "Sáb" },
];
