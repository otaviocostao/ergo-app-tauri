export enum PostureStatus {
  GOOD = "good",
  WARNING = "warning",
  DANGER = "danger",
}

export const POSTURE_STATUS_LABELS: Record<PostureStatus, string> = {
  [PostureStatus.GOOD]: "Boa",
  [PostureStatus.WARNING]: "Atenção",
  [PostureStatus.DANGER]: "Crítica",
};

export const POSTURE_STATUS_OPTIONS = [
  { label: "Boa", value: PostureStatus.GOOD },
  { label: "Atenção", value: PostureStatus.WARNING },
  { label: "Crítica", value: PostureStatus.DANGER },
];
