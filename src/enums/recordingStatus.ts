export enum RecordingStatus {
  IDLE = "idle",
  STARTING = "starting",
  ACTIVE = "active",
  ENDING = "ending",
  ERROR = "error",
}

export const RECORDING_STATUS_LABELS: Record<RecordingStatus, string> = {
  [RecordingStatus.IDLE]: "Inativo",
  [RecordingStatus.STARTING]: "Iniciando",
  [RecordingStatus.ACTIVE]: "Ativo",
  [RecordingStatus.ENDING]: "Encerrando",
  [RecordingStatus.ERROR]: "Erro",
};

